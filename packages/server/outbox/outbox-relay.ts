// Outbox relay: claims batches of committed events and publishes them to SQS.

import type { OutboxDatabase, QueuePublisher } from './outbox.types';

export const RELAY_CADENCE_MS = 500;
const BATCH_SIZE = 100;
const LEASE_SECONDS = 60;

interface ClaimedRow {
  id: string;
  tenant_id: string;
  event_type: string;
  event_version: number;
  queues: string[];
  payload: unknown;
  occurred_at: string | number;
}

export interface OutboxRelayOptions {
  readonly onError?: (error: unknown, eventId: string | undefined) => void;
  readonly cadenceMs?: number;
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
}

export class OutboxRelay {
  private readonly cadenceMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: OutboxDatabase,
    private readonly publisher: QueuePublisher,
    private readonly options: OutboxRelayOptions = {},
  ) {
    this.cadenceMs = options.cadenceMs ?? RELAY_CADENCE_MS;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.leaseSeconds = options.leaseSeconds ?? LEASE_SECONDS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      void this.drain().finally(() => {
        if (!this.running) return;
        this.timer = setTimeout(loop, this.cadenceMs);
        this.timer.unref();
      });
    };
    loop();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  /** Publishes batches until none are left. Returns the number of events published. */
  async drain(): Promise<number> {
    let total = 0;
    try {
      for (;;) {
        const published = await this.publishBatch();
        total += published.claimed;
        if (published.claimed < this.batchSize || published.failed > 0) break;
      }
    } catch (error) {
      this.options.onError?.(error, undefined);
    }
    return total;
  }

  /** Claims one batch and publishes it. Events that fail to publish are released for the next pass. */
  async publishBatch(): Promise<{ claimed: number; failed: number }> {
    const claimed = await this.db.transaction((tx) =>
      tx.query<ClaimedRow>('SELECT * FROM platform.claim_outbox($1, $2)', [this.batchSize, this.leaseSeconds]),
    );
    const done: string[] = [];
    const failed: string[] = [];
    for (const row of claimed.rows) {
      try {
        const body = JSON.stringify({
          id: row.id,
          tenantId: row.tenant_id,
          type: row.event_type,
          version: row.event_version,
          occurredAt: Number(row.occurred_at),
          payload: row.payload,
        });
        // A retry after a partial failure re-sends to queues that already have the event; consumers dedupe on id.
        for (const queue of row.queues) await this.publisher.send(queue, body);
        done.push(row.id);
      } catch (error) {
        failed.push(row.id);
        this.options.onError?.(error, row.id);
      }
    }
    if (done.length > 0) {
      await this.db.transaction((tx) => tx.query('SELECT platform.mark_outbox_published($1::uuid[])', [done]));
    }
    if (failed.length > 0) {
      await this.db.transaction((tx) => tx.query('SELECT platform.release_outbox($1::uuid[])', [failed]));
    }
    return { claimed: claimed.rows.length, failed: failed.length };
  }
}
