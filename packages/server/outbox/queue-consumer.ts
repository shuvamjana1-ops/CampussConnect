// Consumer base classes: idempotent effects and retry through visibility timeout changes.

import {
  domainEventSchema,
  timerMessageSchema,
  type DomainEvent,
  type DomainEventType,
  type DomainEventOf,
  type TimerMessage,
} from '@campusconnect/contracts';
import { ASYNC_JOB_POLICY, retryDelayMs, type RetryPolicy } from '@campusconnect/domain/retry';
import {
  MAX_RECEIVE_COUNT,
  useTenant,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueMessage,
} from './outbox.types';

/** What a decoded message needs for dedupe and tenant scoping. */
export interface DecodedMessage<T> {
  readonly tenantId: string;
  /** Idempotency key, unique per logical delivery. */
  readonly eventId: string;
  readonly value: T;
}

export type MessageResult = 'applied' | 'duplicate' | 'skipped';

export interface QueueConsumerOptions {
  readonly policy?: RetryPolicy;
  readonly random?: () => number;
  readonly onError?: (error: unknown, message: QueueMessage) => void;
  readonly maxMessages?: number;
  readonly waitSeconds?: number;
}

/**
 * Receives messages from one queue. The effect and the `(consumer, event_id)` row commit in one transaction, so a
 * redelivered message applies its effect once. When the handler throws, the message's visibility timeout is set to
 * the next backoff delay; SQS dead-letters it after `MAX_RECEIVE_COUNT` receives.
 */
export abstract class QueueConsumer<T> {
  /** Name recorded in `processed_events`. Unique per consumer. */
  abstract readonly consumer: string;
  abstract readonly queue: string;

  private readonly policy: RetryPolicy;
  private readonly random: () => number;
  private running = false;

  constructor(
    protected readonly db: OutboxDatabase,
    protected readonly client: QueueClient,
    protected readonly options: QueueConsumerOptions = {},
  ) {
    this.policy = options.policy ?? ASYNC_JOB_POLICY;
    this.random = options.random ?? Math.random;
  }

  /** Parses a message body. Throw to reject a malformed message; it then retries and dead-letters. */
  protected abstract decode(body: string): DecodedMessage<T>;

  /** Applies the effect inside the transaction that also records the processed event. */
  protected abstract apply(tx: OutboxSqlClient, value: T, message: DecodedMessage<T>): Promise<void>;

  /** Return false to drop a message without applying it, e.g. a stale timer generation. */
  protected async isCurrent(_tx: OutboxSqlClient, _value: T): Promise<boolean> {
    return true;
  }

  /** Polls the queue until `stop()`. */
  async run(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.poll();
      } catch (error) {
        this.options.onError?.(error, { body: '', receiptHandle: '', receiveCount: 0 });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  async poll(): Promise<number> {
    const messages = await this.client.receive(this.queue, this.options.maxMessages ?? 10, this.options.waitSeconds ?? 20);
    for (const message of messages) await this.handleMessage(message);
    return messages.length;
  }

  async handleMessage(message: QueueMessage): Promise<MessageResult | 'failed'> {
    try {
      const result = await this.process(message.body);
      await this.client.delete(this.queue, message.receiptHandle);
      return result;
    } catch (error) {
      this.options.onError?.(error, message);
      await this.scheduleRetry(message);
      return 'failed';
    }
  }

  /** Decodes and applies one body. Exposed for callers that already hold the body. */
  async process(body: string): Promise<MessageResult> {
    const decoded = this.decode(body);
    return this.db.transaction(async (tx) => {
      await useTenant(tx, decoded.tenantId);
      if (!(await this.isCurrent(tx, decoded.value))) return 'skipped';
      const inserted = await tx.query(
        `INSERT INTO platform.processed_events (consumer, event_id, tenant_id)
         VALUES ($1, $2, $3::uuid)
         ON CONFLICT (consumer, event_id) DO NOTHING
         RETURNING 1`,
        [this.consumer, decoded.eventId, decoded.tenantId],
      );
      if (inserted.rows.length === 0) return 'duplicate';
      await this.apply(tx, decoded.value, decoded);
      return 'applied';
    });
  }

  /**
   * Retry n (1 to 5) waits `5 s * 2^n` plus up to 20% jitter. After the last retry the message is left alone, so the
   * next receive exceeds `maxReceiveCount` and SQS moves it to the DLQ.
   */
  private async scheduleRetry(message: QueueMessage): Promise<void> {
    if (message.receiveCount >= MAX_RECEIVE_COUNT || message.receiveCount > this.policy.maxRetries) return;
    const delayMs = retryDelayMs(this.policy, message.receiveCount, this.random);
    try {
      await this.client.changeVisibility(this.queue, message.receiptHandle, Math.ceil(delayMs / 1000));
    } catch (error) {
      // The message becomes visible again when its current timeout lapses, so a failure here only shortens the delay.
      this.options.onError?.(error, message);
    }
  }
}

/** Consumes domain events of the given types from the outbox. */
export abstract class OutboxEventConsumer<Types extends DomainEventType> extends QueueConsumer<DomainEventOf<Types>> {
  abstract readonly eventTypes: readonly Types[];

  protected abstract handle(tx: OutboxSqlClient, event: DomainEventOf<Types>): Promise<void>;

  protected decode(body: string): DecodedMessage<DomainEventOf<Types>> {
    const event: DomainEvent = domainEventSchema.parse(JSON.parse(body));
    if (!(this.eventTypes as readonly string[]).includes(event.type)) {
      throw new Error(`Consumer ${this.consumer} does not handle ${event.type}.`);
    }
    return { tenantId: event.tenantId, eventId: event.id, value: event as DomainEventOf<Types> };
  }

  protected apply(tx: OutboxSqlClient, value: DomainEventOf<Types>): Promise<void> {
    return this.handle(tx, value);
  }
}

/** Consumes due timers. Messages whose generation is older than the row's current generation are ignored. */
export abstract class TimerConsumer extends QueueConsumer<TimerMessage> {
  readonly queue: string = 'timers';

  protected abstract handle(tx: OutboxSqlClient, timer: TimerMessage): Promise<void>;

  protected decode(body: string): DecodedMessage<TimerMessage> {
    const timer = timerMessageSchema.parse(JSON.parse(body));
    return {
      tenantId: timer.tenantId,
      eventId: `${timer.ticketId}:${timer.kind}:${timer.generation}`,
      value: timer,
    };
  }

  protected override async isCurrent(tx: OutboxSqlClient, timer: TimerMessage): Promise<boolean> {
    const current = await tx.query<{ generation: number }>(
      `SELECT generation FROM platform.timers
       WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND kind = $3`,
      [timer.tenantId, timer.ticketId, timer.kind],
    );
    const generation = current.rows[0]?.generation;
    return generation !== undefined && generation <= timer.generation;
  }

  protected apply(tx: OutboxSqlClient, value: TimerMessage): Promise<void> {
    return this.handle(tx, value);
  }
}
