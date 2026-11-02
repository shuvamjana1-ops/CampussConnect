// @campusconnect/server/outbox: transactional outbox, idempotent consumers and timers.

export { enqueueEvent } from './outbox-writer';
export { OutboxRelay, RELAY_CADENCE_MS, type OutboxRelayOptions } from './outbox-relay';
export {
  QueueConsumer,
  OutboxEventConsumer,
  TimerConsumer,
  type DecodedMessage,
  type MessageResult,
  type QueueConsumerOptions,
} from './queue-consumer';
export { upsertTimer, cancelTimer, type TimerKey } from './timer-store';
export { TimerSweeper, SWEEP_CADENCE_MS, TIMERS_QUEUE, type TimerSweeperOptions } from './timer-sweeper';
export {
  MAX_RECEIVE_COUNT,
  useTenant,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueMessage,
  type QueuePublisher,
} from './outbox.types';
