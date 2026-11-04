import { Module } from "@nestjs/common";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { S3Client } from "@aws-sdk/client-s3";
import { SNSClient } from "@aws-sdk/client-sns";
import { SQSClient } from "@aws-sdk/client-sqs";
import { createSqlDatabase, type SqlDatabase } from "@campusconnect/db";
import { createLogger, type Logger } from "@campusconnect/observability";
import type { TenantId } from "@campusconnect/domain/types";
import { AuditChainer, S3AnchorStore } from "@campusconnect/server/audit";
import { DependencyHealth } from "@campusconnect/server/health";
import { OutboxRelay, TimerSweeper } from "@campusconnect/server/outbox";
import { CloudWatchDlqAgeSource, SnsAlertSink } from "./aws/dlq-adapters";
import { S3ObjectLockClient } from "./aws/s3-object-lock-client";
import { SqsQueues } from "./aws/sqs-queues";
import { loadConfig, type WorkerConfig } from "./config";
import { DlqRealertJob } from "./dlq-realert";
import {
  AUDIT_CHAINER,
  CONFIG,
  DLQ_REALERT_JOB,
  LOGGER,
  OUTBOX_RELAY,
  QUEUE_CONSUMERS,
  SQL_DATABASE,
  SQS_QUEUES,
  TENANT_DIRECTORY,
  TIMER_SWEEPER,
} from "./tokens";
import { WorkerRuntime } from "./staff-runtime";

/** Lists tenants for the audit chainer. The tenancy module replaces this when it exists. */
export interface TenantDirectory {
  listTenants(): Promise<readonly TenantId[]>;
}

@Module({
  providers: [
    { provide: CONFIG, useFactory: (): WorkerConfig => loadConfig() },
    {
      provide: LOGGER,
      useFactory: (): Logger => createLogger({ service: "staff" }),
    },
    { provide: DependencyHealth, useFactory: () => new DependencyHealth() },
    {
      provide: SQL_DATABASE,
      inject: [CONFIG],
      useFactory: (config: WorkerConfig): SqlDatabase =>
        createSqlDatabase({ connectionString: config.databaseUrl }),
    },
    {
      provide: SQS_QUEUES,
      inject: [CONFIG],
      useFactory: (config: WorkerConfig): SqsQueues =>
        new SqsQueues(
          new SQSClient({ region: config.region }),
          config.queueUrlPrefix,
        ),
    },
    {
      provide: TENANT_DIRECTORY,
      inject: [CONFIG],
      useFactory: (config: WorkerConfig): TenantDirectory => ({
        listTenants: () =>
          Promise.resolve(config.tenantIds as readonly TenantId[]),
      }),
    },
    {
      provide: OUTBOX_RELAY,
      inject: [SQL_DATABASE, SQS_QUEUES, LOGGER],
      useFactory: (
        db: SqlDatabase,
        queues: SqsQueues,
        logger: Logger,
      ): OutboxRelay =>
        new OutboxRelay(db, queues, {
          onError: () => logger.error("outbox.relay_failed"),
        }),
    },
    {
      provide: TIMER_SWEEPER,
      inject: [SQL_DATABASE, SQS_QUEUES, LOGGER],
      useFactory: (
        db: SqlDatabase,
        queues: SqsQueues,
        logger: Logger,
      ): TimerSweeper =>
        new TimerSweeper(db, queues, {
          onError: () => logger.error("timers.sweep_failed"),
        }),
    },
    {
      provide: AUDIT_CHAINER,
      inject: [SQL_DATABASE, CONFIG, TENANT_DIRECTORY, LOGGER],
      useFactory: (
        db: SqlDatabase,
        config: WorkerConfig,
        tenants: TenantDirectory,
        logger: Logger,
      ): AuditChainer =>
        new AuditChainer(
          db,
          new S3AnchorStore(
            new S3ObjectLockClient(
              new S3Client({ region: config.region }),
              config.auditAnchorBucket,
            ),
          ),
          {
            listTenants: () => tenants.listTenants(),
            onError: () => logger.error("audit.chainer_failed"),
          },
        ),
    },
    {
      provide: DLQ_REALERT_JOB,
      inject: [CONFIG, LOGGER],
      useFactory: (config: WorkerConfig, logger: Logger): DlqRealertJob =>
        new DlqRealertJob(
          new CloudWatchDlqAgeSource(
            new CloudWatchClient({ region: config.region }),
          ),
          new SnsAlertSink(
            new SNSClient({ region: config.region }),
            config.alertTopicArn,
          ),
          { onError: () => logger.error("dlq.realert_failed") },
        ),
    },
    // Feature modules append their consumers here as they are built.
    { provide: QUEUE_CONSUMERS, useFactory: (): [] => [] },
    WorkerRuntime,
  ],
})
export class WorkerModule {}
