import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

/** Platform KMS keys and Secrets Manager secrets. */
export class SecurityStack extends Stack {
  public readonly dataKey: kms.Key;
  public readonly storageKey: kms.Key;
  public readonly messagingKey: kms.Key;
  public readonly auditKey: kms.Key;
  public readonly appSecret: secretsmanager.Secret;
  public readonly sessionSecret: secretsmanager.Secret;

  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const makeKey = (name: string, description: string): kms.Key =>
      new kms.Key(this, name, {
        alias: `alias/campusconnect/${name.toLowerCase()}`,
        description,
        enableKeyRotation: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });

    this.dataKey = makeKey('Data', 'Aurora, ElastiCache and DynamoDB encryption');
    this.storageKey = makeKey('Storage', 'S3 bucket encryption');
    this.messagingKey = makeKey('Messaging', 'SQS, SNS and EventBridge encryption');
    this.auditKey = makeKey('Audit', 'Audit anchor and audit log encryption');

    this.appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: 'campusconnect/app',
      description: 'Application signing and integration secrets',
      encryptionKey: this.dataKey,
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'signingKey',
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    this.sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      secretName: 'campusconnect/session',
      description: 'Session cookie signing secret',
      encryptionKey: this.dataKey,
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
  }
}
