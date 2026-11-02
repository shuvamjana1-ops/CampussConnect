// The `analytics` queue consumer: projects Ticket, SLA and identity events into the `analytics` fact tables. Facts hold
// dimensions and flags only, never a user id or free text. Each effect commits with its `processed_events` row.

import type { DomainEventOf } from '@campusconnect/contracts';
import {
  OutboxEventConsumer,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import { ANALYTICS_QUEUE, CLOSED_STATUS, REOPENED_STATUS, RESOLVED_STATUS } from './analytics.types';

const FACT_EVENT_TYPES = [
  'TicketCreated',
  'TicketRouted',
  'TicketStatusChanged',
  'TicketPriorityChanged',
  'SlaBreached',
  'TicketEscalated',
  'UserSignedIn',
] as const;
type FactEventType = (typeof FACT_EVENT_TYPES)[number];

interface TicketDims {
  department_id: string | null;
  category_id: string;
  band: string;
  closure_reason: string | null;
  rating: number | null;
  created_at: Date | string;
  first_response_elapsed_sec: number | null;
}

export class FactConsumer extends OutboxEventConsumer<FactEventType> {
  readonly consumer = 'analytics-facts';
  readonly queue = ANALYTICS_QUEUE;
  readonly eventTypes = FACT_EVENT_TYPES;

  constructor(db: OutboxDatabase, client: QueueClient, options: QueueConsumerOptions = {}) {
    super(db, client, options);
  }

  protected async handle(tx: OutboxSqlClient, event: DomainEventOf<FactEventType>): Promise<void> {
    const at = new Date(event.occurredAt);
    switch (event.type) {
      case 'TicketCreated':
        return this.ensureFact(tx, event.payload.ticketId, at);
      case 'TicketRouted':
        await this.ensureFact(tx, event.payload.ticketId, at);
        // A second routing to a different department is a misroute (21.4).
        await tx.query(
          `UPDATE analytics.ticket_facts
           SET reassigned_department = reassigned_department OR (routed AND department_id IS DISTINCT FROM $3::uuid),
               department_id = $3::uuid, routed = true, updated_at = now()
           WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [event.tenantId, event.payload.ticketId, event.payload.departmentId],
        );
        return;
      case 'TicketPriorityChanged':
        await this.ensureFact(tx, event.payload.ticketId, at);
        await tx.query(
          `UPDATE analytics.ticket_facts SET band = $3, updated_at = now()
           WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [event.tenantId, event.payload.ticketId, event.payload.toBand],
        );
        return;
      case 'SlaBreached':
        await this.ensureFact(tx, event.payload.ticketId, at);
        await tx.query(
          `UPDATE analytics.ticket_facts SET breached = true, updated_at = now()
           WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [event.tenantId, event.payload.ticketId],
        );
        return;
      case 'TicketEscalated':
        await this.ensureFact(tx, event.payload.ticketId, at);
        await tx.query(
          `UPDATE analytics.ticket_facts
           SET escalation_level = GREATEST(escalation_level, $3::smallint), updated_at = now()
           WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [event.tenantId, event.payload.ticketId, event.payload.level],
        );
        return;
      case 'TicketStatusChanged':
        return this.statusChanged(tx, event, at);
      case 'UserSignedIn':
        await tx.query(
          `INSERT INTO analytics.signin_facts (tenant_id, day, actor_key, role_class, first_ever)
           VALUES ($1::uuid, ($2::timestamptz AT TIME ZONE 'UTC')::date,
                   sha256(convert_to($1::text || ':' || $3::text, 'UTF8')), $4, $5)
           ON CONFLICT (tenant_id, day, actor_key)
           DO UPDATE SET sign_ins = analytics.signin_facts.sign_ins + 1,
                         first_ever = analytics.signin_facts.first_ever OR EXCLUDED.first_ever`,
          [event.tenantId, at.toISOString(), event.payload.userId, event.payload.roleClass, event.payload.firstSignIn],
        );
        return;
    }
  }

  private async statusChanged(
    tx: OutboxSqlClient,
    event: DomainEventOf<'TicketStatusChanged'>,
    at: Date,
  ): Promise<void> {
    const { ticketId, fromStatus, toStatus } = event.payload;
    await this.ensureFact(tx, ticketId, at);
    const key = [event.tenantId, ticketId, at.toISOString()];
    if (toStatus === RESOLVED_STATUS) {
      await tx.query(
        `UPDATE analytics.ticket_facts
         SET resolved = true, resolved_at = $3::timestamptz, resolved_within_sla = NOT breached, updated_at = now()
         WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        key,
      );
    } else if (toStatus === CLOSED_STATUS) {
      const dims = await this.dims(tx, ticketId);
      await tx.query(
        `UPDATE analytics.ticket_facts
         SET closed = true, closed_at = $3::timestamptz, withdrawn = $4, csat = $5::smallint, updated_at = now()
         WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [...key, dims?.closure_reason === 'Withdrawn', dims?.rating ?? null],
      );
    } else if (toStatus === REOPENED_STATUS) {
      // Reopening a Resolved Ticket is a dispute; any reopening inside the 7-day window counts (4.11, 21.4).
      await tx.query(
        `UPDATE analytics.ticket_facts
         SET reopened = true, disputed = disputed OR $4, disputed_or_reopened_within_7d = true, updated_at = now()
         WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [...key, fromStatus === RESOLVED_STATUS],
      );
    }
    // First response is fixed by the SLA clock once a public Handler message exists (6.8).
    const dims = await this.dims(tx, ticketId);
    if (dims?.first_response_elapsed_sec != null) {
      await tx.query(
        `UPDATE analytics.ticket_facts SET first_response_hours = $3::numeric / 3600, updated_at = now()
         WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [event.tenantId, ticketId, dims.first_response_elapsed_sec],
      );
    }
  }

  private async dims(tx: OutboxSqlClient, ticketId: string): Promise<TicketDims | undefined> {
    const result = await tx.query<TicketDims>('SELECT * FROM analytics.ticket_dims($1::uuid)', [ticketId]);
    return result.rows[0];
  }

  /** Creates the fact row from the Ticket's current dimensions when it does not exist yet. */
  private async ensureFact(tx: OutboxSqlClient, ticketId: string, at: Date): Promise<void> {
    const dims = await this.dims(tx, ticketId);
    if (dims === undefined) return;
    await tx.query(
      `INSERT INTO analytics.ticket_facts (tenant_id, ticket_id, department_id, category_id, band, created_at)
       VALUES (app.tenant(), $1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz)
       ON CONFLICT (tenant_id, ticket_id) DO NOTHING`,
      [ticketId, dims.department_id, dims.category_id, dims.band, new Date(dims.created_at ?? at).toISOString()],
    );
  }
}
