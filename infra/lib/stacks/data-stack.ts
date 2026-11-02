import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export const DEFAULT_CELL_REGION = 'ap-south-1';
export const SECONDARY_REGION = 'ap-south-2';

export interface DataStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly dataKey: kms.IKey;
  readonly storageKey: kms.IKey;
  readonly auditKey: kms.IKey;
  /** Cell region. Defaults to ap-south-1. */
  readonly cellRegion?: string;
}

/** Aurora PostgreSQL 16 (global primary), ElastiCache Serverless Valkey and S3 buckets. */
export class DataStack extends Stack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly globalCluster: rds.CfnGlobalCluster;
  public readonly cacheSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly cache: elasticache.CfnServerlessCache;
  public readonly webBucket: s3.Bucket;
  public readonly quarantineBucket: s3.Bucket;
  public readonly cleanBucket: s3.Bucket;
  public readonly exportsBucket: s3.Bucket;
  public readonly auditAnchorsBucket: s3.Bucket;
  public readonly logsBucket: s3.Bucket;
  public readonly cellRegion: string;

  public constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    this.cellRegion = props.cellRegion ?? DEFAULT_CELL_REGION;

    // ---- Aurora ----
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: props.vpc,
      description: 'Aurora PostgreSQL',
      allowAllOutbound: false,
    });

    const parameterGroup = new rds.ParameterGroup(this, 'PgParams', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      parameters: { 'rds.force_ssl': '1' },
    });

    this.cluster = new rds.DatabaseCluster(this, 'Aurora', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      defaultDatabaseName: 'campusconnect',
      parameterGroup,
      writer: rds.ClusterInstance.provisioned('Writer', {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.XLARGE),
        enablePerformanceInsights: true,
        performanceInsightEncryptionKey: props.dataKey,
      }),
      readers: [
        rds.ClusterInstance.provisioned('Reader', {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.XLARGE),
          promotionTier: 1,
          enablePerformanceInsights: true,
          performanceInsightEncryptionKey: props.dataKey,
        }),
      ],
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: props.dataKey,
      backup: { retention: Duration.days(14) },
      cloudwatchLogsExports: ['postgresql'],
      iamAuthentication: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Aurora Global Database; the ap-south-2 secondary is created in SecondaryRegionStack.
    this.globalCluster = new rds.CfnGlobalCluster(this, 'GlobalCluster', {
      globalClusterIdentifier: 'campusconnect-global',
      sourceDbClusterIdentifier: this.cluster.clusterIdentifier,
      deletionProtection: true,
    });
    this.globalCluster.node.addDependency(this.cluster);

    // ---- ElastiCache Serverless (Valkey, TLS in transit always on) ----
    this.cacheSecurityGroup = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc: props.vpc,
      description: 'ElastiCache Serverless Valkey',
      allowAllOutbound: false,
    });
    this.cache = new elasticache.CfnServerlessCache(this, 'Cache', {
      serverlessCacheName: 'campusconnect-cache',
      engine: 'valkey',
      majorEngineVersion: '8',
      kmsKeyId: props.dataKey.keyArn,
      securityGroupIds: [this.cacheSecurityGroup.securityGroupId],
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      dailySnapshotTime: '03:00',
      snapshotRetentionLimit: 7,
    });

    // ---- S3 ----
    const baseProps: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.storageKey,
      bucketKeyEnabled: true,
      removalPolicy: RemovalPolicy.RETAIN,
    };

    this.logsBucket = new s3.Bucket(this, 'Logs', {
      ...baseProps,
      encryption: s3.BucketEncryption.S3_MANAGED,
      encryptionKey: undefined,
      bucketKeyEnabled: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      lifecycleRules: [{ expiration: Duration.days(400), noncurrentVersionExpiration: Duration.days(30) }],
    });
    const logging = { serverAccessLogsBucket: this.logsBucket };

    this.webBucket = new s3.Bucket(this, 'Web', { ...baseProps, ...logging, serverAccessLogsPrefix: 'web/' });
    this.quarantineBucket = new s3.Bucket(this, 'Quarantine', {
      ...baseProps,
      ...logging,
      serverAccessLogsPrefix: 'quarantine/',
      lifecycleRules: [{ expiration: Duration.days(7), abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });
    this.cleanBucket = new s3.Bucket(this, 'Clean', { ...baseProps, ...logging, serverAccessLogsPrefix: 'clean/' });
    this.exportsBucket = new s3.Bucket(this, 'Exports', {
      ...baseProps,
      ...logging,
      serverAccessLogsPrefix: 'exports/',
      lifecycleRules: [{ expiration: Duration.days(30) }],
    });
    this.auditAnchorsBucket = new s3.Bucket(this, 'AuditAnchors', {
      ...baseProps,
      ...logging,
      serverAccessLogsPrefix: 'audit-anchors/',
      encryptionKey: props.auditKey,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(Duration.days(365 * 3)),
    });

    // CloudFront (EdgeStack) reads the web bucket through Origin Access Control. The grant is written here, scoped to
    // this account's distributions, so the edge stack does not create a circular dependency.
    const cloudFrontPrincipal = new iam.ServicePrincipal('cloudfront.amazonaws.com');
    const distributionArns = `arn:${this.partition}:cloudfront::${this.account}:distribution/*`;
    this.webBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [cloudFrontPrincipal],
        resources: [this.webBucket.arnForObjects('*')],
        conditions: { StringLike: { 'AWS:SourceArn': distributionArns } },
      }),
    );
    props.storageKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
        principals: [cloudFrontPrincipal],
        resources: ['*'],
        conditions: { StringLike: { 'AWS:SourceArn': distributionArns } },
      }),
    );
  }
}

export interface SecondaryRegionStackProps extends StackProps {
  readonly globalClusterIdentifier: string;
}

/** Aurora Global Database secondary cluster in ap-south-2 (deploy with env.region = ap-south-2). */
export class SecondaryRegionStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.CfnDBCluster;

  public constructor(scope: Construct, id: string, props: SecondaryRegionStackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 3,
      natGateways: 0,
      subnetConfiguration: [{ name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });
    const sg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'Aurora secondary',
      allowAllOutbound: false,
    });
    const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
      description: 'Aurora secondary subnets',
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    const parameterGroup = new rds.ParameterGroup(this, 'PgParams', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      parameters: { 'rds.force_ssl': '1' },
    });

    this.cluster = new rds.CfnDBCluster(this, 'Secondary', {
      engine: 'aurora-postgresql',
      engineVersion: '16.4',
      globalClusterIdentifier: props.globalClusterIdentifier,
      dbSubnetGroupName: subnetGroup.subnetGroupName,
      dbClusterParameterGroupName: parameterGroup.bindToCluster({}).parameterGroupName,
      vpcSecurityGroupIds: [sg.securityGroupId],
      storageEncrypted: true,
      deletionProtection: true,
    });
    new rds.CfnDBInstance(this, 'SecondaryInstance', {
      dbClusterIdentifier: this.cluster.ref,
      engine: 'aurora-postgresql',
      dbInstanceClass: 'db.r6g.xlarge',
    });
  }
}
