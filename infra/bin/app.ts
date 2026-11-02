import { App, Aspects, Tags } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ComputeStack } from '../lib/stacks/compute-stack';
import { DEFAULT_CELL_REGION, DataStack, SECONDARY_REGION, SecondaryRegionStack } from '../lib/stacks/data-stack';
import { EdgeStack } from '../lib/stacks/edge-stack';
import { MessagingStack } from '../lib/stacks/messaging-stack';
import { NetworkStack } from '../lib/stacks/network-stack';
import { ObservabilityStack } from '../lib/stacks/observability-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { SecurityStack } from '../lib/stacks/security-stack';

const app = new App();

function ctx(name: string, fallback?: string): string {
  const value = (app.node.tryGetContext(name) as string | undefined) ?? process.env[name.toUpperCase()] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing CDK context "${name}" (pass with -c ${name}=...)`);
  }
  return value;
}

const account = process.env.CDK_DEFAULT_ACCOUNT;
const cellRegion = ctx('cellRegion', DEFAULT_CELL_REGION);
const cellEnv = { account, region: cellRegion };
const baseDomain = ctx('baseDomain');
const hostedZoneId = ctx('hostedZoneId');

const network = new NetworkStack(app, 'CampusConnect-Network', { env: cellEnv });
const security = new SecurityStack(app, 'CampusConnect-Security', { env: cellEnv });

const data = new DataStack(app, 'CampusConnect-Data', {
  env: cellEnv,
  crossRegionReferences: true,
  vpc: network.vpc,
  dataKey: security.dataKey,
  storageKey: security.storageKey,
  auditKey: security.auditKey,
  cellRegion,
});

new SecondaryRegionStack(app, 'CampusConnect-DataSecondary', {
  env: { account, region: SECONDARY_REGION },
  globalClusterIdentifier: 'campusconnect-global',
}).addDependency(data);

const messaging = new MessagingStack(app, 'CampusConnect-Messaging', {
  env: cellEnv,
  messagingKey: security.messagingKey,
  quarantineBucket: data.quarantineBucket,
  storageKey: security.storageKey,
  sesDomain: ctx('sesDomain', baseDomain),
});

const compute = new ComputeStack(app, 'CampusConnect-Compute', {
  env: cellEnv,
  vpc: network.vpc,
  dataKey: security.dataKey,
  cluster: data.cluster,
  dbSecurityGroup: data.dbSecurityGroup,
  cache: data.cache,
  cacheSecurityGroup: data.cacheSecurityGroup,
  appSecret: security.appSecret,
  sessionSecret: security.sessionSecret,
  queues: messaging.queues,
  deadLetterQueues: messaging.deadLetterQueues,
  cleanBucket: data.cleanBucket,
  quarantineBucket: data.quarantineBucket,
  exportsBucket: data.exportsBucket,
  auditAnchorsBucket: data.auditAnchorsBucket,
  storageKey: security.storageKey,
  auditKey: security.auditKey,
  messagingKey: security.messagingKey,
  baseDomain,
  hostedZoneId,
  albCertificateArn: ctx('albCertificateArn'),
  imageTag: ctx('imageTag', 'latest'),
});

// CloudFront certificates and WAF web ACLs must live in us-east-1.
new EdgeStack(app, 'CampusConnect-Edge', {
  env: { account, region: 'us-east-1' },
  crossRegionReferences: true,
  baseDomain,
  hostedZoneId,
  cloudFrontCertificateArn: ctx('cloudFrontCertificateArn'),
  webBucketName: data.webBucket.bucketName,
  webBucketRegion: cellRegion,
  albDomainName: compute.albDomainName,
});

new ObservabilityStack(app, 'CampusConnect-Observability', {
  env: cellEnv,
  loadBalancer: compute.loadBalancer,
  queues: messaging.queues,
  deadLetterQueues: messaging.deadLetterQueues,
  cluster: data.cluster,
  baseDomain,
  syntheticTenantSlug: ctx('syntheticTenantSlug', 'synthetic'),
  canarySecret: Secret.fromSecretCompleteArn(app, 'CanarySecret', ctx('canarySecretArn')),
  slackWorkspaceId: app.node.tryGetContext('slackWorkspaceId') as string | undefined,
  slackChannelId: app.node.tryGetContext('slackChannelId') as string | undefined,
});

new PipelineStack(app, 'CampusConnect-Pipeline', {
  env: cellEnv,
  repoOwner: ctx('repoOwner'),
  repoName: ctx('repoName', 'campusconnect'),
  codeStarConnectionArn: ctx('codeStarConnectionArn'),
  stagingUrl: ctx('stagingUrl', `https://staging.${baseDomain}`),
  stagingHost: ctx('stagingHost', `staging.${baseDomain}`),
});

Tags.of(app).add('project', 'campusconnect');
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
