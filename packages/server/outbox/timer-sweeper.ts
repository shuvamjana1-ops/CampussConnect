// Timer sweeper: every 10 seconds, enqueues due timers to the `timers` queue with their generation.

import type { TimerMessage } from '@campusconnect/contracts';
import type { OutboxDatabase, QueuePublisher } from './outbox.types';

export const SWEEP_CADENCE_MS = 10_000;
export const TIMERS_QUEUE = 'timers';
const BATCH_SIZE = 200;
const LEASE_SECONDS = 60;

interface ClaimedTimer {
  tenant_id: string;
  ticket_id: string;
  kind: string;
  due_at: Date | string;
  generation: number;
}

export interface TimerSweeperOptions {
  readonly onError?: (error: unknown) => void;
  readonly cadenceMs?: number;
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
}

export class TimerSweeper {
  private readonly cadenceMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: OutboxDatabase,
    private readonly publisher: QueuePublisher,
    private readonly options: TimerSweeperOptions = {},
  ) {
    this.cadenceMs = options.cadenceMs ?? SWEEP_CADENCE_MS;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.leaseSeconds = options.leaseSeconds ?? LEASE_SECONDS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      void this.sweep().finally(() => {
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

  /** Enqueues every due timer. Returns the number enqueued. */
  async sweep(): Promise<number> {
    let enqueued = 0;
    try {
      for (;;) {
        const claimed = await this.db.transaction((tx) =>
          tx.query<ClaimedTimer>('SELECT * FROM platform.claim_due_timers($1, $2)', [this.batchSize, this.leaseSeconds]),
        );
        let failed = 0;
        for (const row of claimed.rows) {
          try {
            const message: TimerMessage = {
              tenantId: row.tenant_id,
              ticketId: row.ticket_id,
              kind: row.kind,
              generation: row.generation,
              dueAt: new Date(row.due_at).getTime(),
            };
            await this.publisher.send(TIMERS_QUEUE, JSON.stringify(message));
            await this.db.transaction((tx) =>
              tx.query('SELECT platform.mark_timer_enqueued($1::uuid, $2::uuid, $3, $4)', [
                row.tenant_id,
                row.ticket_id,
                row.kind,
                row.generation,
              ]),
            );
            enqueued += 1;
          } catch (error) {
            failed += 1;
            this.options.onError?.(error);
            await this.db
              .transaction((tx) =>
                tx.query('SELECT platform.release_timer($1::uuid, $2::uuid, $3)', [row.tenant_id, row.ticket_id, row.kind]),
              )
              .catch((releaseError: unknown) => this.options.onError?.(releaseError));
          }
        }
        if (claimed.rows.length < this.batchSize || failed > 0) break;
      }
    } catch (error) {
      this.options.onError?.(error);
    }
    return enqueued;
  }
}
