import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

/** Phase 1 SQS queues (design: Asynchronous processing). */
export const QUEUE_NAMES = [
  'triage',
  'sla',
  'timers',
  'notify',
  'deliver-push',
  'deliver-email',
  'emergency',
  'broadcast',
  'match',
  'embed',
  'files',
  'erp-sync',
  'reports',
  'analytics',
  'privacy',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** One attempt plus five retries (24.6). */
export const MAX_RECEIVE_COUNT = 6;

interface ScheduleDef {
  readonly id: string;
  readonly queue: QueueName;
  readonly expression: string;
  readonly job: string;
}

const SCHEDULES: readonly ScheduleDef[] = [
  { id: 'ErpSync', queue: 'erp-sync', expression: 'cron(30 20 * * ? *)', job: 'erp.daily-sync' },
  { id: 'AnalyticsRefresh', queue: 'analytics', expression: 'rate(5 minutes)', job: 'analytics.refresh' },
  { id: 'ReportSchedules', queue: 'reports', expression: 'rate(1 minute)', job: 'reports.run-due' },
  { id: 'Retention', queue: 'privacy', expression: 'cron(0 21 * * ? *)', job: 'privacy.retention' },
  { id: 'DlqRealert', queue: 'notify', expression: 'rate(1 hour)', job: 'ops.dlq-realert' },
  { id: 'Digests', queue: 'notify', expression: 'cron(30 2 * * ? *)', job: 'notify.digests' },
];

export interface MessagingStackProps extends StackProps {
  readonly messagingKey: kms.IKey;
  readonly quarantineBucket: s3.IBucket;
  readonly storageKey: kms.IKey;
  /** Verified sending domain for SES. */
  readonly sesDomain: string;
}

/** SQS queues with DLQs, EventBridge Scheduler, GuardDuty Malware Protection and SES. */
export class MessagingStack extends Stack {
  public readonly queues: Readonly<Record<QueueName, sqs.Queue>>;
  public readonly deadLetterQueues: Readonly<Record<QueueName, sqs.Queue>>;
  public readonly sesConfigurationSet: ses.CfnConfigurationSet;
  public readonly sesIdentity: ses.CfnEmailIdentity;

  public constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    const queues: Partial<Record<QueueName, sqs.Queue>> = {};
    const dlqs: Partial<Record<QueueName, sqs.Queue>> = {};
    for (const name of QUEUE_NAMES) {
      const pascal = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
      const dlq = new sqs.Queue(this, `${pascal}Dlq`, {
        queueName: `campusconnect-${name}-dlq`,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: props.messagingKey,
        retentionPeriod: Duration.days(14),
        enforceSSL: true,
      });
      dlqs[name] = dlq;
      queues[name] = new sqs.Queue(this, `${pascal}Queue`, {
        queueName: `campusconnect-${name}`,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: props.messagingKey,
        visibilityTimeout: Duration.seconds(60),
        retentionPeriod: Duration.days(4),
        enforceSSL: true,
        deadLetterQueue: { queue: dlq, maxReceiveCount: MAX_RECEIVE_COUNT },
      });
    }
    this.queues = queues as Record<QueueName, sqs.Queue>;
    this.deadLetterQueues = dlqs as Record<QueueName, sqs.Queue>;

    // ---- EventBridge Scheduler ----
    const group = new scheduler.CfnScheduleGroup(this, 'ScheduleGroup', {
      name: 'campusconnect',
    });
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    for (const def of SCHEDULES) {
      const queue = this.queues[def.queue];
      queue.grantSendMessages(schedulerRole);
      new scheduler.CfnSchedule(this, `${def.id}Schedule`, {
        name: `campusconnect-${def.id}`,
        groupName: group.name,
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: def.expression,
        scheduleExpressionTimezone: 'UTC',
        target: {
          arn: queue.queueArn,
          roleArn: schedulerRole.roleArn,
          input: JSON.stringify({ type: 'scheduled', job: def.job }),
          retryPolicy: { maximumRetryAttempts: 5, maximumEventAgeInSeconds: 3600 },
        },
      }).addDependency(group);
    }

    // ---- GuardDuty Malware Protection for S3 (quarantine bucket) ----
    const malwareRole = new iam.Role(this, 'MalwareProtectionRole', {
      assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
    });
    props.quarantineBucket.grantRead(malwareRole);
    props.quarantineBucket.grantPut(malwareRole);
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObjectTagging', 's3:GetObjectTagging', 's3:PutObjectVersionTagging', 's3:GetObjectVersionTagging'],
        resources: [props.quarantineBucket.arnForObjects('*')],
      }),
    );
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [props.storageKey.keyArn],
      }),
    );
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['events:PutRule', 'events:DeleteRule', 'events:PutTargets', 'events:RemoveTargets'],
        resources: [
          `arn:${this.partition}:events:${this.region}:${this.account}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*`,
        ],
        conditions: {
          StringLike: { 'events:ManagedBy': 'malware-protection-plan.guardduty.amazonaws.com' },
        },
      }),
    );
    malwareRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['events:DescribeRule', 'events:ListTargetsByRule'],
        resources: [
          `arn:${this.partition}:events:${this.region}:${this.account}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*`,
        ],
      }),
    );

    const malwarePlan = new guardduty.CfnMalwareProtectionPlan(this, 'QuarantineMalwarePlan', {
      role: malwareRole.roleArn,
      protectedResource: {
        s3Bucket: { bucketName: props.quarantineBucket.bucketName },
      },
      actions: { tagging: { status: 'ENABLED' } },
    });
    malwarePlan.node.addDependency(malwareRole);

    // Scan results are routed to the `files` queue.
    new events.Rule(this, 'MalwareScanResults', {
      description: 'GuardDuty Malware Protection for S3 scan results to the files queue',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Malware Protection Object Scan Result'],
        detail: { s3ObjectDetails: { bucketName: [props.quarantineBucket.bucketName] } },
      },
      targets: [
        new targets.SqsQueue(this.queues.files, {
          retryAttempts: 5,
          deadLetterQueue: this.deadLetterQueues.files,
        }),
      ],
    });

    // ---- SES ----
    this.sesConfigurationSet = new ses.CfnConfigurationSet(this, 'SesConfigSet', {
      name: 'campusconnect',
      reputationOptions: { reputationMetricsEnabled: true },
      sendingOptions: { sendingEnabled: true },
      deliveryOptions: { tlsPolicy: 'REQUIRE' },
      suppressionOptions: { suppressedReasons: ['BOUNCE', 'COMPLAINT'] },
    });
    this.sesIdentity = new ses.CfnEmailIdentity(this, 'SesIdentity', {
      emailIdentity: props.sesDomain,
      configurationSetAttributes: { configurationSetName: this.sesConfigurationSet.name },
      dkimSigningAttributes: { nextSigningKeyLength: 'RSA_2048_BIT' },
    });
    this.sesIdentity.addDependency(this.sesConfigurationSet);
  }
}
