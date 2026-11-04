import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Logger } from "@campusconnect/observability";
import type { AuditChainer } from "@campusconnect/server/audit";
import type {
  OutboxRelay,
  QueueConsumer,
  TimerSweeper,
} from "@campusconnect/server/outbox";
import type { SqlDatabase } from "@campusconnect/db";
import type { DlqRealertJob } from "./dlq-realert";
import {
  AUDIT_CHAINER,
  DLQ_REALERT_JOB,
  LOGGER,
  OUTBOX_RELAY,
  QUEUE_CONSUMERS,
  SQL_DATABASE,
  TIMER_SWEEPER,
} from "./tokens";

const KEEP_ALIVE_MS = 60_000;

/** Starts the background loops when the application context is ready and stops them on shutdown. */
@Injectable()
export class WorkerRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private consumerLoops: Promise<void>[] = [];
  private keepAlive: NodeJS.Timeout | undefined;

  constructor(
    @Inject(OUTBOX_RELAY) private readonly relay: OutboxRelay,
    @Inject(TIMER_SWEEPER) private readonly sweeper: TimerSweeper,
    @Inject(AUDIT_CHAINER) private readonly chainer: AuditChainer,
    @Inject(DLQ_REALERT_JOB) private readonly dlqRealert: DlqRealertJob,
    @Inject(QUEUE_CONSUMERS)
    private readonly consumers: readonly QueueConsumer<unknown>[],
    @Inject(SQL_DATABASE) private readonly db: SqlDatabase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    // The loops use unref'd timers, so hold the event loop open until shutdown.
    this.keepAlive = setInterval(() => undefined, KEEP_ALIVE_MS);
    this.relay.start();
    this.sweeper.start();
    this.chainer.start();
    this.dlqRealert.start();
    this.consumerLoops = this.consumers.map((consumer) =>
      consumer.run().catch(() => {
        this.logger.error("staff.consumer_stopped");
      }),
    );
    this.logger.info("staff.started");
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.keepAlive);
    this.relay.stop();
    this.sweeper.stop();
    this.chainer.stop();
    this.dlqRealert.stop();
    for (const consumer of this.consumers) consumer.stop();
    // Consumers finish the poll in flight (up to the long-poll wait) before their loops end.
    await Promise.allSettled(this.consumerLoops);
    await this.db.close();
    this.logger.info("staff.stopped");
  }
}
