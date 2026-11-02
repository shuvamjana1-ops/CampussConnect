
/** Settings read from the environment once at start-up. Secrets come from the task's injected environment. */
export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly region: string;
  /** Prefix that, followed by a queue name, gives the queue URL, e.g. `https://sqs.ap-south-1.amazonaws.com/123456789012/cc-prod-`. */
  readonly queueUrlPrefix: string;
  /** SNS topic that forwards alerts to the operations channel. */
  readonly alertTopicArn: string;
  /** Tenants whose audit chains this worker advances, until the tenancy module provides the list. */
  readonly tenantIds: readonly string[];
  /** Bucket for audit chain-head anchors (S3 Object Lock). */
  readonly auditAnchorBucket: string;
  /** Optional Hugging Face token for AI provider requests. */
  readonly hfToken: string | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    region: required(env, 'AWS_REGION'),
    queueUrlPrefix: required(env, 'SQS_QUEUE_URL_PREFIX'),
    alertTopicArn: required(env, 'ALERT_TOPIC_ARN'),
    auditAnchorBucket: required(env, 'AUDIT_ANCHOR_BUCKET'),
    tenantIds: (env['WORKER_TENANT_IDS'] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
    hfToken: env['HF_TOKEN'] || undefined,
  };
}
