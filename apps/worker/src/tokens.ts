export const CONFIG = Symbol('CONFIG');
export const LOGGER = Symbol('LOGGER');
export const SQL_DATABASE = Symbol('SQL_DATABASE');
export const SQS_QUEUES = Symbol('SQS_QUEUES');
export const OUTBOX_RELAY = Symbol('OUTBOX_RELAY');
export const TIMER_SWEEPER = Symbol('TIMER_SWEEPER');
export const AUDIT_CHAINER = Symbol('AUDIT_CHAINER');
export const DLQ_REALERT_JOB = Symbol('DLQ_REALERT_JOB');
/**
 * The SQS consumers this worker runs (`QueueConsumer[]`). Feature modules add theirs here as they are built:
 * each consumer extends `OutboxEventConsumer` or `TimerConsumer` and is constructed with the database and queue client.
 */
export const QUEUE_CONSUMERS = Symbol('QUEUE_CONSUMERS');
/** Lists the tenants whose audit chains this worker advances. */
export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
