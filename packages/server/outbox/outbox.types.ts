// Shared types for the outbox relay, consumers and timers.

/** Minimal SQL surface the outbox module needs. Both `pg` clients and `withTenant` transactions adapt to it. */
export interface OutboxSqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** A database that can open a transaction. */
export interface OutboxDatabase {
  transaction<T>(fn: (tx: OutboxSqlClient) => Promise<T>): Promise<T>;
}

/** Publishes a message body to a named queue. A thin adapter over `@aws-sdk/client-sqs` implements it in the staff app. */
export interface QueuePublisher {
  send(queue: string, body: string): Promise<void>;
}

/** A message received from a queue. */
export interface QueueMessage {
  readonly body: string;
  /** Opaque handle used to delete the message or change its visibility. */
  readonly receiptHandle: string;
  /** SQS `ApproximateReceiveCount`: 1 on the first delivery. */
  readonly receiveCount: number;
}

/** The SQS operations a consumer loop needs. */
export interface QueueClient {
  receive(
    queue: string,
    maxMessages: number,
    waitSeconds: number,
  ): Promise<readonly QueueMessage[]>;
  delete(queue: string, receiptHandle: string): Promise<void>;
  changeVisibility(
    queue: string,
    receiptHandle: string,
    timeoutSeconds: number,
  ): Promise<void>;
}

/** One attempt plus five retries; SQS then moves the message to the DLQ (24.6). */
export const MAX_RECEIVE_COUNT = 6;

/** Sets the transaction-local tenant that row-level security reads. */
export async function useTenant(
  tx: OutboxSqlClient,
  tenantId: string,
): Promise<void> {
  await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
