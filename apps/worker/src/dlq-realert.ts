import { EVENT_QUEUES } from '@campusconnect/contracts';
import { TIMERS_QUEUE } from '@campusconnect/server/outbox';

/** A DLQ that holds a message older than this raises an alert (24.7). */
export const DLQ_ALERT_AGE_SECONDS = 15 * 60;
/** CloudWatch alarms do not repeat, so this job repeats the alert every hour (24.7). */
export const DLQ_REALERT_INTERVAL_MS = 60 * 60 * 1000;
export const DLQ_SUFFIX = '-dlq';

/** Names of every work queue, derived from the event routing table plus the timers queue. */
export function workQueueNames(): string[] {
  return [...new Set([...Object.values(EVENT_QUEUES).flat(), TIMERS_QUEUE])].sort();
}

export function dlqNameOf(queue: string): string {
  return `${queue}${DLQ_SUFFIX}`;
}

/** Age in seconds of the oldest message in a queue, or 0 when it is empty. */
export interface DlqAgeSource {
  oldestMessageAgeSeconds(queue: string): Promise<number>;
}

/** Sends an alert to the operations channel. Payloads hold queue names and numbers only. */
export interface AlertSink {
  dlqMessageStuck(alert: { readonly queue: string; readonly ageSeconds: number }): Promise<void>;
}

export interface DlqRealertOptions {
  readonly queues?: readonly string[];
  readonly intervalMs?: number;
  readonly alertAgeSeconds?: number;
  readonly onError?: (error: unknown, queue: string | undefined) => void;
}

/**
 * Hourly job that alerts for every DLQ whose oldest message is older than 15 minutes. The first alert comes
 * from the CloudWatch alarm; this job repeats it for as long as the message stays (24.7).
 */
export class DlqRealertJob {
  private readonly queues: readonly string[];
  private readonly intervalMs: number;
  private readonly alertAgeSeconds: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly ages: DlqAgeSource,
    private readonly alerts: AlertSink,
    private readonly options: DlqRealertOptions = {},
  ) {
    this.queues = options.queues ?? workQueueNames();
    this.intervalMs = options.intervalMs ?? DLQ_REALERT_INTERVAL_MS;
    this.alertAgeSeconds = options.alertAgeSeconds ?? DLQ_ALERT_AGE_SECONDS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      void this.run().finally(() => {
        if (!this.running) return;
        this.timer = setTimeout(loop, this.intervalMs);
        this.timer.unref();
      });
    };
    loop();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  /** Checks every DLQ once. Returns the queues that were alerted. */
  async run(): Promise<string[]> {
    const alerted: string[] = [];
    for (const queue of this.queues) {
      try {
        const ageSeconds = await this.ages.oldestMessageAgeSeconds(dlqNameOf(queue));
        if (ageSeconds <= this.alertAgeSeconds) continue;
        await this.alerts.dlqMessageStuck({ queue: dlqNameOf(queue), ageSeconds });
        alerted.push(queue);
      } catch (error) {
        this.options.onError?.(error, queue);
      }
    }
    return alerted;
  }
}
