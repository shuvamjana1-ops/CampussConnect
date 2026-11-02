// `notify` consumer: turns Ticket events into a notification for the Student plus one planned delivery per channel
// (requirements 9.1, 9.2, 9.4). The notification and its deliveries commit with the `processed_events` row; the
// per-channel messages are then handled by the `deliver-push` and `deliver-email` workers.

import type { TemplateEvent } from '@campusconnect/channels';
import type { DomainEventOf, DomainEventType } from '@campusconnect/contracts';
import { OutboxEventConsumer, type OutboxDatabase, type OutboxSqlClient, type QueueClient, type QueueConsumerOptions } from '../outbox';
import { createNotification, loadRecipient } from './notification-store';
import {
  DELIVERY_QUEUES,
  isDeliveryChannel,
  type DelayedQueuePublisher,
  type DeliveryMessage,
  type NotificationContent,
} from './notifications.types';

const NOTIFY_EVENT_TYPES = [
  'TicketCreated',
  'TicketRouted',
  'TicketStatusChanged',
  'TicketAssignmentChanged',
  'GrievanceDecisionRecorded',
  // Routed to `notify` by the outbox; recipients come from matching (Phase 2), so it is acknowledged without effect.
  'OpportunityPublished',
] as const satisfies readonly DomainEventType[];

type NotifyEventType = (typeof NOTIFY_EVENT_TYPES)[number];

export interface NotifyConsumerOptions extends QueueConsumerOptions {
  /** Origin prepended to in-app deep links, e.g. `https://campus.example.edu`. Empty keeps links relative. */
  readonly appBaseUrl?: string;
}

interface TicketRow {
  ref: string;
  status: string;
  type: 'request' | 'complaint';
  reporter_id: string;
}

export class NotifyConsumer extends OutboxEventConsumer<NotifyEventType> {
  readonly consumer = 'notify';
  readonly queue = 'notify';
  readonly eventTypes = NOTIFY_EVENT_TYPES;

  private readonly appBaseUrl: string;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly publisher: DelayedQueuePublisher,
    options: NotifyConsumerOptions = {},
  ) {
    super(db, client, options);
    this.appBaseUrl = (options.appBaseUrl ?? '').replace(/\/+$/u, '');
  }

  protected async handle(tx: OutboxSqlClient, event: DomainEventOf<NotifyEventType>): Promise<void> {
    if (event.type === 'OpportunityPublished') return;

    const ticket = await this.loadTicket(tx, event.tenantId, event.payload.ticketId);
    // The Ticket was erased or never became visible; there is nobody to tell.
    if (ticket === undefined) return;

    const recipientId = event.type === 'TicketCreated' ? event.payload.studentId : ticket.reporter_id;
    const recipient = await loadRecipient(tx, event.tenantId, recipientId);
    if (recipient === undefined) return;

    const content = this.contentFor(event, ticket, recipient.prefs.locale);
    const created = await createNotification(tx, event.tenantId, recipient, content, false);
    for (const delivery of created.deliveries) {
      if (delivery.status !== 'pending' || !isDeliveryChannel(delivery.channel)) continue;
      const message: DeliveryMessage = { tenantId: event.tenantId, deliveryId: delivery.id, attempt: 1 };
      await this.publisher.send(DELIVERY_QUEUES[delivery.channel], JSON.stringify(message));
    }
  }

  private async loadTicket(tx: OutboxSqlClient, tenantId: string, ticketId: string): Promise<TicketRow | undefined> {
    const result = await tx.query<TicketRow>(
      `SELECT ref, status, type, reporter_id::text AS reporter_id
         FROM tickets.tickets WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticketId],
    );
    return result.rows[0];
  }

  /** Only `{ ticketRef, statusLabel, deepLink, locale }` leave this method (9.7). */
  private contentFor(
    event: DomainEventOf<Exclude<NotifyEventType, 'OpportunityPublished'>>,
    ticket: TicketRow,
    locale: 'en' | 'hi',
  ): NotificationContent {
    const params = {
      ticketRef: ticket.ref,
      statusLabel: ticket.status,
      deepLink: `${this.appBaseUrl}/tickets/${event.payload.ticketId}`,
      locale,
    };
    const name: TemplateEvent = (() => {
      switch (event.type) {
        case 'TicketCreated':
          return 'ticket_created';
        case 'TicketRouted':
          return 'ticket_routed';
        case 'TicketAssignmentChanged':
          return 'ticket_assignment_changed';
        case 'GrievanceDecisionRecorded':
          return 'grievance_status_changed';
        case 'TicketStatusChanged':
          return ticket.type === 'complaint' ? 'grievance_status_changed' : 'ticket_status_changed';
      }
    })();
    return { event: name, params } as NotificationContent;
  }
}
