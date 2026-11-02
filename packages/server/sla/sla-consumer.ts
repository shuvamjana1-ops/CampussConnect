// The `sla` queue consumer: routing starts the clock; status, band and assignment changes pause, resume, stop,
// recalculate or reset it. Each effect commits with its `processed_events` row, so redelivery applies it once.

import type { DomainEventOf } from '@campusconnect/contracts';
import type { Instant } from '@campusconnect/domain/types';
import {
  OutboxEventConsumer,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import type { SlaEngine } from './sla-engine';
import {
  AWAITING_STUDENT_STATUS,
  CLOSED_STATUS,
  REOPENED_STATUS,
  RESOLVED_STATUS,
  SLA_QUEUE,
} from './sla.types';

const SLA_EVENT_TYPES = ['TicketRouted', 'TicketStatusChanged', 'TicketPriorityChanged', 'TicketAssignmentChanged'] as const;
type SlaEventType = (typeof SLA_EVENT_TYPES)[number];

export class SlaConsumer extends OutboxEventConsumer<SlaEventType> {
  readonly consumer = 'sla';
  readonly queue = SLA_QUEUE;
  readonly eventTypes = SLA_EVENT_TYPES;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly engine: SlaEngine,
    options: QueueConsumerOptions = {},
  ) {
    super(db, client, options);
  }

  protected async handle(tx: OutboxSqlClient, event: DomainEventOf<SlaEventType>): Promise<void> {
    const now = event.occurredAt as Instant;
    const { tenantId } = event;
    switch (event.type) {
      case 'TicketRouted':
        return this.engine.start(tx, tenantId, event.payload.ticketId, now);
      case 'TicketPriorityChanged':
        return this.engine.changeBand(tx, tenantId, event.payload.ticketId, now, event.payload.toBand);
      case 'TicketAssignmentChanged':
        return this.engine.recalculate(tx, tenantId, event.payload.ticketId);
      case 'TicketStatusChanged': {
        const { ticketId, fromStatus, toStatus } = event.payload;
        if (toStatus === AWAITING_STUDENT_STATUS) {
          return this.engine.pause(tx, tenantId, ticketId, now, 'awaiting_student');
        }
        if (toStatus === RESOLVED_STATUS) return this.engine.stop(tx, tenantId, ticketId, now, true);
        if (toStatus === CLOSED_STATUS) return this.engine.stop(tx, tenantId, ticketId, now, false);
        if (toStatus === REOPENED_STATUS) return this.engine.reopen(tx, tenantId, ticketId, now);
        if (fromStatus === AWAITING_STUDENT_STATUS) return this.engine.resume(tx, tenantId, ticketId, now);
        return this.engine.recalculate(tx, tenantId, ticketId);
      }
    }
  }
}
