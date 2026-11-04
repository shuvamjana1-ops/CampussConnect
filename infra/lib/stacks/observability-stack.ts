import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import type * as sqs from "aws-cdk-lib/aws-sqs";
import * as synthetics from "aws-cdk-lib/aws-synthetics";
import type { Construct } from "constructs";
import type { QueueName } from "./messaging-stack";

/** Namespace and dimension used by the Embedded Metric Format emitter in `packages/observability`. */
const APP_NAMESPACE = "CampusConnect";
const WORKER_SERVICE = "staff";

/** Alarm thresholds (design: Observability, requirement 25.2, 24.7). */
export const ERROR_RATE_PERCENT_THRESHOLD = 5;
export const P95_LATENCY_SECONDS_THRESHOLD = 2;
export const QUEUE_DEPTH_THRESHOLD = 1000;
export const QUEUE_DEPTH_PERIODS = 5;
export const DLQ_AGE_SECONDS_THRESHOLD = 15 * 60;
/** The sweeper runs every 10 s and the chainer every 500 ms with a 2 s recording target (18.1). */
export const SWEEPER_LAG_SECONDS_THRESHOLD = 60;
export const CHAINER_LAG_SECONDS_THRESHOLD = 10;

export interface CanaryRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: string;
}

export interface ObservabilityStackProps extends StackProps {
  readonly loadBalancer: elbv2.IApplicationLoadBalancer;
  readonly queues: Readonly<Record<QueueName, sqs.IQueue>>;
  readonly deadLetterQueues: Readonly<Record<QueueName, sqs.IQueue>>;
  readonly cluster: rds.IDatabaseCluster;
  /** Base domain; canaries call `https://<syntheticTenantSlug>.<baseDomain>`. */
  readonly baseDomain: string;
  readonly syntheticTenantSlug: string;
  /** Secret holding `{ "token": "..." }`, a session token for a synthetic Student and Staff user of the synthetic Tenant. */
  readonly canarySecret: secretsmanager.ISecret;
  readonly ticketSubmission?: CanaryRequest;
  readonly workbenchQueue?: CanaryRequest;
  /** When both are set, alarms are forwarded to Slack through AWS Chatbot. */
  readonly slackWorkspaceId?: string;
  readonly slackChannelId?: string;
}

const DEFAULT_TICKET_SUBMISSION: CanaryRequest = {
  method: "POST",
  path: "/api/v1/tickets",
  body: JSON.stringify({
    category: "synthetic",
    subject: "Synthetic check",
    description: "Automated availability check. No action needed.",
    synthetic: true,
  }),
};
const DEFAULT_WORKBENCH_QUEUE: CanaryRequest = {
  method: "GET",
  path: "/api/v1/workbench/queue",
};

/** Inline canary: one authenticated HTTPS request that fails on a non-2xx status or a timeout. */
const CANARY_CODE = `const https=require('https');
const {SecretsManagerClient:S,GetSecretValueCommand:G}=require('@aws-sdk/client-secrets-manager');
const e=process.env;
exports.handler=async()=>{
const s=await new S({}).send(new G({SecretId:e.SECRET_ARN}));
const t=JSON.parse(s.SecretString).token;
const u=new URL(e.BASE_URL+e.REQUEST_PATH);
const b=e.BODY||'';
const c=await new Promise((res,rej)=>{
const q=https.request(u,{method:e.METHOD,timeout:10000,headers:{authorization:'Bearer '+t,'content-type':'application/json','content-length':Buffer.byteLength(b)}},p=>{p.resume();p.on('end',()=>res(p.statusCode));});
q.on('timeout',()=>q.destroy(new Error('timeout')));q.on('error',rej);q.end(b);});
if(c<200||c>=300)throw new Error('status '+c);
};`;

/** Alarms, SNS to AWS Chatbot, Synthetics canaries and the RDS restore-failure alarm. */
export class ObservabilityStack extends Stack {
  public readonly alertTopic: sns.Topic;
  public readonly alertKey: kms.Key;
  public readonly canaries: Readonly<
    Record<"ticket-submission" | "workbench-queue", synthetics.Canary>
  >;

  public constructor(
    scope: Construct,
    id: string,
    props: ObservabilityStackProps,
  ) {
    super(scope, id, props);

    // ---- Alert topic ----
    this.alertKey = new kms.Key(this, "AlertKey", {
      alias: "alias/campusconnect-alerts",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    for (const service of [
      "cloudwatch.amazonaws.com",
      "events.amazonaws.com",
      "rds.amazonaws.com",
    ]) {
      this.alertKey.addToResourcePolicy(
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal(service)],
          actions: ["kms:GenerateDataKey*", "kms:Decrypt"],
          resources: ["*"],
        }),
      );
    }
    this.alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: "campusconnect-alerts",
      masterKey: this.alertKey,
      enforceSSL: true,
    });
    const alarmAction = new cwActions.SnsAction(this.alertTopic);

    if (
      props.slackWorkspaceId !== undefined &&
      props.slackChannelId !== undefined
    ) {
      new chatbot.SlackChannelConfiguration(this, "OpsChannel", {
        slackChannelConfigurationName: "campusconnect-ops",
        slackWorkspaceId: props.slackWorkspaceId,
        slackChannelId: props.slackChannelId,
        notificationTopics: [this.alertTopic],
        loggingLevel: chatbot.LoggingLevel.ERROR,
      });
    }

    const addAlarm = (alarm: cloudwatch.Alarm): cloudwatch.Alarm => {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
      return alarm;
    };

    // ---- API error rate and p95 latency over 5 minutes (25.2) ----
    const fiveMinutes = Duration.minutes(5);
    const requests = props.loadBalancer.metrics.requestCount({
      period: fiveMinutes,
      statistic: "Sum",
    });
    const errors = props.loadBalancer.metrics.httpCodeTarget(
      elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
      {
        period: fiveMinutes,
        statistic: "Sum",
      },
    );
    const errorRate = new cloudwatch.MathExpression({
      expression: "IF(requests > 0, 100 * errors / requests, 0)",
      usingMetrics: { requests, errors },
      label: "API 5xx error rate (%)",
      period: fiveMinutes,
    });
    addAlarm(
      new cloudwatch.Alarm(this, "ApiErrorRateAlarm", {
        alarmName: "campusconnect-api-error-rate",
        alarmDescription: "API 5xx rate above 5% over 5 minutes",
        metric: errorRate,
        threshold: ERROR_RATE_PERCENT_THRESHOLD,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    );
    addAlarm(
      new cloudwatch.Alarm(this, "ApiP95LatencyAlarm", {
        alarmName: "campusconnect-api-p95-latency",
        alarmDescription: "API p95 latency above 2 seconds over 5 minutes",
        metric: props.loadBalancer.metrics.targetResponseTime({
          period: fiveMinutes,
          statistic: "p95",
        }),
        threshold: P95_LATENCY_SECONDS_THRESHOLD,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    );

    // ---- Queue depth and DLQ age (25.2, 24.7) ----
    for (const [name, queue] of Object.entries(props.queues)) {
      const pascal = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) =>
        c.toUpperCase(),
      );
      addAlarm(
        new cloudwatch.Alarm(this, `${pascal}QueueDepthAlarm`, {
          alarmName: `campusconnect-${name}-queue-depth`,
          alarmDescription: `Queue ${name} above 1,000 visible messages for 5 consecutive 1-minute periods`,
          metric: queue.metricApproximateNumberOfMessagesVisible({
            period: Duration.minutes(1),
            statistic: "Maximum",
          }),
          threshold: QUEUE_DEPTH_THRESHOLD,
          evaluationPeriods: QUEUE_DEPTH_PERIODS,
          datapointsToAlarm: QUEUE_DEPTH_PERIODS,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }),
      );
    }
    for (const [name, dlq] of Object.entries(props.deadLetterQueues)) {
      const pascal = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) =>
        c.toUpperCase(),
      );
      addAlarm(
        new cloudwatch.Alarm(this, `${pascal}DlqAgeAlarm`, {
          alarmName: `campusconnect-${name}-dlq-age`,
          alarmDescription: `Oldest message in the ${name} DLQ is older than 15 minutes`,
          metric: dlq.metricApproximateAgeOfOldestMessage({
            period: Duration.minutes(1),
            statistic: "Maximum",
          }),
          threshold: DLQ_AGE_SECONDS_THRESHOLD,
          evaluationPeriods: 1,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }),
      );
    }

    // ---- Sweeper and audit chainer lag (EMF metrics from the staff). Missing data breaches: no data means a stopped loop. ----
    const lagMetric = (metricName: string): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace: APP_NAMESPACE,
        metricName,
        dimensionsMap: { Service: WORKER_SERVICE },
        period: Duration.minutes(1),
        statistic: "Maximum",
      });
    addAlarm(
      new cloudwatch.Alarm(this, "SweeperLagAlarm", {
        alarmName: "campusconnect-sweeper-lag",
        alarmDescription: "Timer sweeper lag above 60 seconds",
        metric: lagMetric("SweeperLag"),
        threshold: SWEEPER_LAG_SECONDS_THRESHOLD,
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      }),
    );
    addAlarm(
      new cloudwatch.Alarm(this, "AuditChainerLagAlarm", {
        alarmName: "campusconnect-audit-chainer-lag",
        alarmDescription:
          "Audit chainer lag above 10 seconds (recording target is 2 seconds)",
        metric: lagMetric("AuditChainerLag"),
        threshold: CHAINER_LAG_SECONDS_THRESHOLD,
        evaluationPeriods: 3,
        datapointsToAlarm: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      }),
    );

    // ---- Restore failure from RDS events (24.8) ----
    new events.Rule(this, "RdsRestoreFailure", {
      ruleName: "campusconnect-rds-restore-failure",
      description:
        "Aurora failure, backup and restoration events to the alert topic",
      eventPattern: {
        source: ["aws.rds"],
        detailType: ["RDS DB Cluster Event", "RDS DB Instance Event"],
        resources: [props.cluster.clusterArn],
        detail: { EventCategories: ["failure", "restoration", "backup"] },
      },
      targets: [new targets.SnsTopic(this.alertTopic)],
    });

    // ---- Synthetics canaries every minute (24.1, 24.2) ----
    const artifacts = new s3.Bucket(this, "CanaryArtifacts", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(30) }],
    });
    const baseUrl = `https://${props.syntheticTenantSlug}.${props.baseDomain}`;
    const makeCanary = (
      key: "ticket-submission" | "workbench-queue",
      pascal: string,
      request: CanaryRequest,
    ): synthetics.Canary => {
      const canary = new synthetics.Canary(this, `${pascal}Canary`, {
        canaryName: `cc-${key}`,
        runtime: new synthetics.Runtime(
          "syn-nodejs-puppeteer-9.1",
          synthetics.RuntimeFamily.NODEJS,
        ),
        test: synthetics.Test.custom({
          handler: "index.handler",
          code: synthetics.Code.fromInline(CANARY_CODE),
        }),
        schedule: synthetics.Schedule.rate(Duration.minutes(1)),
        timeout: Duration.seconds(30),
        artifactsBucketLocation: { bucket: artifacts },
        environmentVariables: {
          BASE_URL: baseUrl,
          REQUEST_PATH: request.path,
          METHOD: request.method,
          BODY: request.body ?? "",
          SECRET_ARN: props.canarySecret.secretArn,
        },
        startAfterCreation: true,
        successRetentionPeriod: Duration.days(7),
        failureRetentionPeriod: Duration.days(31),
      });
      props.canarySecret.grantRead(canary.role);
      addAlarm(
        new cloudwatch.Alarm(this, `${pascal}CanaryAlarm`, {
          alarmName: `campusconnect-canary-${key}`,
          alarmDescription: `Canary ${key} failing for 3 consecutive minutes`,
          metric: canary.metricSuccessPercent({
            period: Duration.minutes(1),
            statistic: "Minimum",
          }),
          threshold: 100,
          evaluationPeriods: 3,
          datapointsToAlarm: 3,
          comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        }),
      );
      return canary;
    };
    this.canaries = {
      "ticket-submission": makeCanary(
        "ticket-submission",
        "TicketSubmission",
        props.ticketSubmission ?? DEFAULT_TICKET_SUBMISSION,
      ),
      "workbench-queue": makeCanary(
        "workbench-queue",
        "WorkbenchQueue",
        props.workbenchQueue ?? DEFAULT_WORKBENCH_QUEUE,
      ),
    };
  }
}
