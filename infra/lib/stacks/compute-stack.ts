import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as appscaling from "aws-cdk-lib/aws-applicationautoscaling";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import type * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import type * as rds from "aws-cdk-lib/aws-rds";
import type * as elasticache from "aws-cdk-lib/aws-elasticache";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { QueueName } from "./messaging-stack";

export const API_PORT = 3000;
export const MOCK_SSO_PORT = 4010;
/** The API runs at least three tasks, one per Availability Zone (23.1, 22.7). */
export const API_MIN_TASKS = 3;
export const API_MAX_TASKS = 30;
export const WORKER_MIN_TASKS = 2;
export const WORKER_MAX_TASKS = 20;

/** Queues whose backlog drives staff scaling. CloudWatch alarms accept at most ten metrics per expression. */
const WORKER_SCALING_QUEUES: readonly QueueName[] = [
  "triage",
  "sla",
  "timers",
  "notify",
  "deliver-push",
  "deliver-email",
  "broadcast",
  "files",
];

export interface ComputeStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly dataKey: kms.IKey;
  readonly cluster: rds.DatabaseCluster;
  readonly dbSecurityGroup: ec2.ISecurityGroup;
  readonly cache: elasticache.CfnServerlessCache;
  readonly cacheSecurityGroup: ec2.ISecurityGroup;
  readonly appSecret: secretsmanager.ISecret;
  readonly sessionSecret: secretsmanager.ISecret;
  readonly queues: Readonly<Record<QueueName, sqs.IQueue>>;
  readonly deadLetterQueues: Readonly<Record<QueueName, sqs.IQueue>>;
  readonly cleanBucket: s3.IBucket;
  readonly quarantineBucket: s3.IBucket;
  readonly exportsBucket: s3.IBucket;
  readonly auditAnchorsBucket: s3.IBucket;
  readonly storageKey: kms.IKey;
  readonly auditKey: kms.IKey;
  readonly messagingKey: kms.IKey;
  /** Base domain, for example `campusconnect.example`. Tenant subdomains are `<slug>.<baseDomain>`. */
  readonly baseDomain: string;
  readonly hostedZoneId: string;
  /** ARN of a regional ACM certificate covering `*.<baseDomain>` (Tenant subdomains, `alb.` and `sso.`). */
  readonly albCertificateArn: string;
  /** Container image tag deployed to all services. */
  readonly imageTag?: string;
  /** Extra environment for the mock SSO provider (seed file, issuer URL, client registration). */
  readonly mockSsoEnvironment?: Readonly<Record<string, string>>;
  readonly mockSsoSecrets?: Readonly<Record<string, secretsmanager.ISecret>>;
}

/** ECS Fargate services, the public ALB and the Tenant registry. */
export class ComputeStack extends Stack {
  public readonly ecsCluster: ecs.Cluster;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly apiService: ecs.FargateService;
  public readonly workerService: ecs.FargateService;
  public readonly mockSsoService: ecs.FargateService;
  public readonly tenantRegistry: dynamodb.Table;
  public readonly albDomainName: string;
  public readonly repositories: Readonly<
    Record<"api" | "staff" | "mock-sso", ecr.Repository>
  >;

  public constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const imageTag = props.imageTag ?? "latest";
    this.albDomainName = `alb.${props.baseDomain}`;

    // ---- Tenant registry (Tenant -> region/cell mapping, 1.9) ----
    this.tenantRegistry = new dynamodb.Table(this, "TenantRegistry", {
      tableName: "campusconnect-tenant-registry",
      partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.dataKey,
      pointInTimeRecovery: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.tenantRegistry.addGlobalSecondaryIndex({
      indexName: "by-tenant-id",
      partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
    });

    // ---- Cluster and repositories ----
    this.ecsCluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      containerInsights: true,
    });
    const repo = (name: "api" | "staff" | "mock-sso"): ecr.Repository =>
      new ecr.Repository(this, `Repo-${name}`, {
        repositoryName: `campusconnect/${name}`,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        encryption: ecr.RepositoryEncryption.KMS,
        encryptionKey: props.storageKey,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ maxImageCount: 50 }],
      });
    this.repositories = {
      api: repo("api"),
      staff: repo("staff"),
      "mock-sso": repo("mock-sso"),
    };

    // ---- Security groups ----
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: props.vpc,
      description: "Public ALB",
      allowAllOutbound: false,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "HTTP redirect to HTTPS",
    );

    const serviceSg = (name: string): ec2.SecurityGroup =>
      new ec2.SecurityGroup(this, `${name}Sg`, {
        vpc: props.vpc,
        description: `${name} Fargate tasks`,
        allowAllOutbound: true,
      });
    const apiSg = serviceSg("Api");
    const workerSg = serviceSg("staff");
    const mockSsoSg = serviceSg("MockSso");

    albSg.addEgressRule(apiSg, ec2.Port.tcp(API_PORT));
    albSg.addEgressRule(mockSsoSg, ec2.Port.tcp(MOCK_SSO_PORT));
    apiSg.addIngressRule(albSg, ec2.Port.tcp(API_PORT), "ALB to api");
    mockSsoSg.addIngressRule(
      albSg,
      ec2.Port.tcp(MOCK_SSO_PORT),
      "ALB to mock-sso",
    );

    // Ingress rules live in this stack so the data stack does not depend on it.
    const allow = (
      id: string,
      target: ec2.ISecurityGroup,
      source: ec2.ISecurityGroup,
      port: number,
    ): void => {
      new ec2.CfnSecurityGroupIngress(this, id, {
        groupId: target.securityGroupId,
        sourceSecurityGroupId: source.securityGroupId,
        ipProtocol: "tcp",
        fromPort: port,
        toPort: port,
        description: "Service access",
      });
    };
    for (const [name, sg] of [
      ["Api", apiSg],
      ["staff", workerSg],
    ] as const) {
      allow(`${name}ToDb`, props.dbSecurityGroup, sg, 5432);
      allow(`${name}ToCache`, props.cacheSecurityGroup, sg, 6379);
      allow(`${name}ToCacheReader`, props.cacheSecurityGroup, sg, 6380);
    }

    // ---- Shared task configuration ----
    const queueEnv: Record<string, string> = {};
    for (const [name, queue] of Object.entries(props.queues)) {
      queueEnv[`QUEUE_URL_${name.toUpperCase().replaceAll("-", "_")}`] =
        queue.queueUrl;
    }
    const dbSecret = props.cluster.secret;
    if (dbSecret === undefined) {
      throw new Error(
        "Aurora cluster must have a generated credentials secret",
      );
    }
    const sharedEnv: Record<string, string> = {
      NODE_ENV: "production",
      AWS_REGION: this.region,
      DB_HOST: props.cluster.clusterEndpoint.hostname,
      DB_READER_HOST: props.cluster.clusterReadEndpoint.hostname,
      DB_PORT: String(props.cluster.clusterEndpoint.port),
      DB_NAME: "campusconnect",
      DB_SSL: "require",
      CACHE_HOST: props.cache.attrEndpointAddress,
      CACHE_PORT: props.cache.attrEndpointPort,
      CACHE_TLS: "true",
      TENANT_REGISTRY_TABLE: this.tenantRegistry.tableName,
      CLEAN_BUCKET: props.cleanBucket.bucketName,
      QUARANTINE_BUCKET: props.quarantineBucket.bucketName,
      EXPORTS_BUCKET: props.exportsBucket.bucketName,
      AUDIT_ANCHORS_BUCKET: props.auditAnchorsBucket.bucketName,
      BASE_DOMAIN: props.baseDomain,
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
      ...queueEnv,
    };
    const sharedSecrets = (): Record<string, ecs.Secret> => ({
      DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      APP_SIGNING_KEY: ecs.Secret.fromSecretsManager(
        props.appSecret,
        "signingKey",
      ),
      SESSION_SECRET: ecs.Secret.fromSecretsManager(props.sessionSecret),
    });

    const grantCommon = (role: iam.IRole): void => {
      dbSecret.grantRead(role);
      props.appSecret.grantRead(role);
      props.sessionSecret.grantRead(role);
      props.dataKey.grantEncryptDecrypt(role);
      this.tenantRegistry.grantReadData(role);
      props.cluster.grantConnect(role, "campusconnect");
    };

    const makeTaskDefinition = (
      name: string,
      cpu: number,
      memoryMiB: number,
    ): ecs.FargateTaskDefinition =>
      new ecs.FargateTaskDefinition(this, `${name}Task`, {
        cpu,
        memoryLimitMiB: memoryMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });

    const makeLogDriver = (name: string): ecs.LogDriver =>
      ecs.LogDrivers.awsLogs({
        streamPrefix: name,
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          logGroupName: `/campusconnect/${name}`,
          retention: logs.RetentionDays.ONE_YEAR,
          encryptionKey: props.dataKey,
          removalPolicy: RemovalPolicy.RETAIN,
        }),
      });

    /** ADOT collector sidecar: receives OTLP on localhost and exports traces to X-Ray. */
    const addAdotSidecar = (
      task: ecs.FargateTaskDefinition,
      name: string,
    ): void => {
      task.addContainer("adot-collector", {
        image: ecs.ContainerImage.fromRegistry(
          "public.ecr.aws/aws-observability/aws-otel-collector:v0.41.1",
        ),
        command: ["--config=/etc/ecs/ecs-default-config.yaml"],
        essential: false,
        cpu: 64,
        memoryReservationMiB: 128,
        logging: makeLogDriver("adot-" + name),
      });
      task.taskRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
      );
    };

    // ---- api ----
    const apiTask = makeTaskDefinition("Api", 1024, 2048);
    apiTask.addContainer("api", {
      image: ecs.ContainerImage.fromEcrRepository(
        this.repositories.api,
        imageTag,
      ),
      portMappings: [{ containerPort: API_PORT }],
      environment: { ...sharedEnv, PORT: String(API_PORT) },
      secrets: sharedSecrets(),
      logging: makeLogDriver("api"),
      readonlyRootFilesystem: true,
      stopTimeout: Duration.seconds(30),
    });
    addAdotSidecar(apiTask, "api");
    grantCommon(apiTask.taskRole);
    for (const q of Object.values(props.queues))
      q.grantSendMessages(apiTask.taskRole);
    props.cleanBucket.grantReadWrite(apiTask.taskRole);
    props.quarantineBucket.grantPut(apiTask.taskRole);
    props.exportsBucket.grantRead(apiTask.taskRole);
    props.storageKey.grantEncryptDecrypt(apiTask.taskRole);
    props.messagingKey.grantEncryptDecrypt(apiTask.taskRole);

    this.apiService = new ecs.FargateService(this, "ApiService", {
      cluster: this.ecsCluster,
      taskDefinition: apiTask,
      desiredCount: API_MIN_TASKS,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [apiSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
      enableExecuteCommand: false,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });

    // ---- staff ----
    const workerTask = makeTaskDefinition("staff", 1024, 2048);
    workerTask.addContainer("staff", {
      image: ecs.ContainerImage.fromEcrRepository(
        this.repositories.staff,
        imageTag,
      ),
      environment: sharedEnv,
      secrets: sharedSecrets(),
      logging: makeLogDriver("staff"),
      readonlyRootFilesystem: true,
      stopTimeout: Duration.seconds(60),
    });
    addAdotSidecar(workerTask, "staff");
    grantCommon(workerTask.taskRole);
    for (const q of Object.values(props.queues)) {
      q.grantConsumeMessages(workerTask.taskRole);
      q.grantSendMessages(workerTask.taskRole);
    }
    for (const q of Object.values(props.deadLetterQueues)) {
      q.grantConsumeMessages(workerTask.taskRole);
    }
    props.cleanBucket.grantReadWrite(workerTask.taskRole);
    props.quarantineBucket.grantReadWrite(workerTask.taskRole);
    props.exportsBucket.grantReadWrite(workerTask.taskRole);
    props.auditAnchorsBucket.grantPut(workerTask.taskRole);
    props.storageKey.grantEncryptDecrypt(workerTask.taskRole);
    props.auditKey.grantEncryptDecrypt(workerTask.taskRole);
    props.messagingKey.grantEncryptDecrypt(workerTask.taskRole);
    workerTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:PutMetricData",
        ],
        resources: ["*"],
      }),
    );
    workerTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:${this.partition}:ses:${this.region}:${this.account}:*`,
        ],
      }),
    );

    this.workerService = new ecs.FargateService(this, "WorkerService", {
      cluster: this.ecsCluster,
      taskDefinition: workerTask,
      desiredCount: WORKER_MIN_TASKS,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [workerSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });

    // ---- mock-sso ----
    const ssoTask = makeTaskDefinition("MockSso", 256, 512);
    const ssoSecrets: Record<string, ecs.Secret> = {};
    for (const [key, secret] of Object.entries(props.mockSsoSecrets ?? {})) {
      ssoSecrets[key] = ecs.Secret.fromSecretsManager(secret);
      secret.grantRead(ssoTask.taskRole);
    }
    ssoTask.addContainer("mock-sso", {
      image: ecs.ContainerImage.fromEcrRepository(
        this.repositories["mock-sso"],
        imageTag,
      ),
      portMappings: [{ containerPort: MOCK_SSO_PORT }],
      environment: {
        MOCK_SSO_PORT: String(MOCK_SSO_PORT),
        MOCK_SSO_HOST: "0.0.0.0",
        MOCK_SSO_ISSUER_BASE_URL: `https://sso.${props.baseDomain}`,
        ...props.mockSsoEnvironment,
      },
      secrets: ssoSecrets,
      logging: makeLogDriver("mock-sso"),
      readonlyRootFilesystem: true,
    });
    this.mockSsoService = new ecs.FargateService(this, "MockSsoService", {
      cluster: this.ecsCluster,
      taskDefinition: ssoTask,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      securityGroups: [mockSsoSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });

    // ---- ALB: TLS 1.2+ policy, HTTP redirects to HTTPS ----
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      dropInvalidHeaderFields: true,
      deletionProtection: true,
      idleTimeout: Duration.seconds(60),
    });
    this.loadBalancer.setAttribute(
      "routing.http.desync_mitigation_mode",
      "strictest",
    );

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "AlbCertificate",
      props.albCertificateArn,
    );
    const httpsListener = this.loadBalancer.addListener("Https", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.TLS13_RES,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/plain",
        messageBody: "Not found",
      }),
    });
    this.loadBalancer.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });

    const apiTargets = httpsListener.addTargets("ApiTargets", {
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/api/*", "/health/*"]),
      ],
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.apiService],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/health/dependencies",
        healthyHttpCodes: "200",
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    httpsListener.addTargets("MockSsoTargets", {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([`sso.${props.baseDomain}`]),
      ],
      port: MOCK_SSO_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.mockSsoService],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/",
        healthyHttpCodes: "200-404",
        interval: Duration.seconds(30),
      },
    });

    // ---- Auto scaling ----
    const apiScaling = this.apiService.autoScaleTaskCount({
      minCapacity: API_MIN_TASKS,
      maxCapacity: API_MAX_TASKS,
    });
    apiScaling.scaleOnCpuUtilization("ApiCpu", {
      targetUtilizationPercent: 55,
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(1),
    });
    apiScaling.scaleOnRequestCount("ApiRequests", {
      requestsPerTarget: 1000,
      targetGroup: apiTargets,
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(1),
    });

    const backlogMetrics: Record<string, cloudwatch.IMetric> = {};
    WORKER_SCALING_QUEUES.forEach((name, index) => {
      backlogMetrics[`q${String(index)}`] = props.queues[
        name
      ].metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: "Maximum",
      });
    });
    const backlog = new cloudwatch.MathExpression({
      expression: Object.keys(backlogMetrics).join("+"),
      usingMetrics: backlogMetrics,
      label: "staff queue backlog",
      period: Duration.minutes(1),
    });
    const workerScaling = this.workerService.autoScaleTaskCount({
      minCapacity: WORKER_MIN_TASKS,
      maxCapacity: WORKER_MAX_TASKS,
    });
    workerScaling.scaleOnMetric("WorkerBacklog", {
      metric: backlog,
      adjustmentType: appscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      scalingSteps: [
        { upper: 50, change: -1 },
        { lower: 200, change: +1 },
        { lower: 1000, change: +3 },
        { lower: 5000, change: +6 },
      ],
      evaluationPeriods: 2,
      cooldown: Duration.minutes(2),
    });

    // ---- DNS for the ALB and mock SSO ----
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.baseDomain,
    });
    const albTarget = route53.RecordTarget.fromAlias(
      new route53Targets.LoadBalancerTarget(this.loadBalancer),
    );
    for (const [rid, recordName] of [
      ["AlbRecord", "alb"],
      ["SsoRecord", "sso"],
    ] as const) {
      new route53.ARecord(this, rid, { zone, recordName, target: albTarget });
      new route53.AaaaRecord(this, `${rid}V6`, {
        zone,
        recordName,
        target: albTarget,
      });
    }
  }
}
