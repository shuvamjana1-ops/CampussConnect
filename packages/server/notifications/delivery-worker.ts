// `deliver-push` and `deliver-email` workers. Each message performs one attempt on one channel. A failure is retried
// at 20, 40 and 60 seconds, then falls back to the next enabled channel in the order in-app, web push, email; when
// nothing is left and nothing delivered, the failure is recorded for the Tenant_Admin (requirements 9.5, 9.6).

import { nextStep, type Channel } from '@campusconnect/domain/notifications';
import {
  QueueConsumer,
  type DecodedMessage,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import { attemptChannel, enabledChannelsOf, loadRecipient } from './notification-store';
import {
  DELIVERY_QUEUES,
  isDeliveryChannel,
  type DelayedQueuePublisher,
  type DeliveryChannel,
  type DeliveryMessage,
  type ExternalAdapters,
} from './notifications.types';

/** Retries after the first attempt; `nextStep` retries up to this many times on a channel. */
const PERMANENT_FAILURE_RETRIES = 3;
const MAX_ERROR_LENGTH = 200;

interface DeliveryRow {
  id: string;
  notification_id: string;
  channel: Channel;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  user_id: string;
  emergency: boolean;
}

function parseMessage(body: string): DeliveryMessage {
  const value: unknown = JSON.parse(body);
  const v = value as Partial<Record<keyof DeliveryMessage, unknown>>;
  if (
    typeof v.tenantId !== 'string' ||
    typeof v.deliveryId !== 'string' ||
    typeof v.attempt !== 'number' ||
    !Number.isInteger(v.attempt) ||
    v.attempt < 1
  ) {
    throw new Error('Malformed delivery message.');
  }
  return { tenantId: v.tenantId, deliveryId: v.deliveryId, attempt: v.attempt };
}

export class DeliveryWorker extends QueueConsumer<DeliveryMessage> {
  readonly consumer: string;
  readonly queue: string;

  constructor(
    private readonly channel: DeliveryChannel,
    db: OutboxDatabase,
    client: QueueClient,
    private readonly adapters: ExternalAdapters,
    private readonly publisher: DelayedQueuePublisher,
    options: QueueConsumerOptions = {},
  ) {
    super(db, client, options);
    this.queue = DELIVERY_QUEUES[channel];
    this.consumer = DELIVERY_QUEUES[channel];
  }

  protected decode(body: string): DecodedMessage<DeliveryMessage> {
    const message = parseMessage(body);
    return { tenantId: message.tenantId, eventId: `${message.deliveryId}:${message.attempt}`, value: message };
  }

  /**
   * Drops a message whose attempt is no longer the next one (already sent, or a later attempt exists). A missing row
   * throws, so the message retries: the producer may not have committed yet when the message was published.
   */
  protected override async isCurrent(tx: OutboxSqlClient, message: DeliveryMessage): Promise<boolean> {
    const row = await this.loadDelivery(tx, message);
    if (row === undefined) throw new Error('Delivery row not visible yet.');
    return row.status === 'pending' && row.channel === this.channel && row.attempts === message.attempt - 1;
  }

  protected async apply(tx: OutboxSqlClient, message: DeliveryMessage): Promise<void> {
    const delivery = await this.loadDelivery(tx, message);
    if (delivery === undefined) throw new Error('Delivery row not visible yet.');

    const result = await attemptChannel(tx, this.adapters, message.tenantId, delivery.notification_id, this.channel);
    const attempts = delivery.attempts + 1;
    if (result.ok) {
      await this.update(tx, message, 'sent', attempts, null, null);
      return;
    }

    const error = result.error.slice(0, MAX_ERROR_LENGTH);
    // A permanent failure skips the retries and goes straight to fallback.
    const retriesDone = result.retryable ? attempts - 1 : PERMANENT_FAILURE_RETRIES;
    const recipient = await loadRecipient(tx, message.tenantId, delivery.user_id);
    const enabled = recipient === undefined ? [] : enabledChannelsOf(recipient, delivery.emergency);
    const attempted = await this.attemptedChannels(tx, message.tenantId, delivery.notification_id);
    const step = nextStep({ channel: this.channel, retriesDone, attempted }, enabled);

    if (step.kind === 'retry') {
      await this.update(tx, message, 'pending', attempts, error, step.delaySec);
      const next: DeliveryMessage = { ...message, attempt: attempts + 1 };
      await this.publisher.send(this.queue, JSON.stringify(next), step.delaySec);
      return;
    }

    await this.update(tx, message, 'failed', attempts, error, null);
    if (step.kind === 'fallback') {
      await this.startFallback(tx, message.tenantId, delivery.notification_id, step.channel);
      return;
    }
    await this.recordFailureIfAllFailed(tx, message.tenantId, delivery.notification_id);
  }

  private async loadDelivery(tx: OutboxSqlClient, message: DeliveryMessage): Promise<DeliveryRow | undefined> {
    const result = await tx.query<DeliveryRow>(
      `SELECT d.id::text AS id, d.notification_id::text AS notification_id, d.channel, d.status, d.attempts,
              n.user_id::text AS user_id, n.emergency
         FROM notify.notification_deliveries d
         JOIN notify.notifications n ON n.tenant_id = d.tenant_id AND n.id = d.notification_id
        WHERE d.tenant_id = $1::uuid AND d.id = $2::uuid
        FOR UPDATE OF d`,
      [message.tenantId, message.deliveryId],
    );
    return result.rows[0];
  }

  private async attemptedChannels(tx: OutboxSqlClient, tenantId: string, notificationId: string): Promise<Channel[]> {
    const result = await tx.query<{ channel: Channel }>(
      `SELECT channel FROM notify.notification_deliveries WHERE tenant_id = $1::uuid AND notification_id = $2::uuid`,
      [tenantId, notificationId],
    );
    return result.rows.map((r) => r.channel);
  }

  private async update(
    tx: OutboxSqlClient,
    message: DeliveryMessage,
    status: 'pending' | 'sent' | 'failed',
    attempts: number,
    error: string | null,
    delaySec: number | null,
  ): Promise<void> {
    await tx.query(
      `UPDATE notify.notification_deliveries
          SET status = $3, attempts = $4, last_error_code = $5,
              next_attempt_at = CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(secs => $6::int) END,
              updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [message.tenantId, message.deliveryId, status, attempts, error, delaySec],
    );
  }

  /** Creates the delivery for the fallback channel and queues its first attempt. In-app is satisfied by the stored row. */
  private async startFallback(tx: OutboxSqlClient, tenantId: string, notificationId: string, channel: Channel): Promise<void> {
    const external = isDeliveryChannel(channel);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO notify.notification_deliveries (tenant_id, notification_id, channel, status, attempts, next_attempt_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, CASE WHEN $4 = 'pending' THEN now() END)
       ON CONFLICT (tenant_id, notification_id, channel) DO NOTHING
       RETURNING id::text AS id`,
      [tenantId, notificationId, channel, external ? 'pending' : 'sent', external ? 0 : 1],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined || !external) return;
    const next: DeliveryMessage = { tenantId, deliveryId: id, attempt: 1 };
    await this.publisher.send(DELIVERY_QUEUES[channel], JSON.stringify(next));
  }

  /** Writes one failure record when no channel delivered and none is still pending (9.6). */
  private async recordFailureIfAllFailed(tx: OutboxSqlClient, tenantId: string, notificationId: string): Promise<void> {
    await tx.query(
      `INSERT INTO notify.notification_failures (tenant_id, notification_id, failed_channels)
       SELECT $1::uuid, $2::uuid, array_agg(channel ORDER BY channel)
         FROM notify.notification_deliveries
        WHERE tenant_id = $1::uuid AND notification_id = $2::uuid AND status = 'failed'
       HAVING NOT EXISTS (
         SELECT 1 FROM notify.notification_deliveries
          WHERE tenant_id = $1::uuid AND notification_id = $2::uuid AND status IN ('sent', 'pending')
       ) AND count(*) >= 1
       ON CONFLICT (tenant_id, notification_id) DO NOTHING`,
      [tenantId, notificationId],
    );
  }
}
