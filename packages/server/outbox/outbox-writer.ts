// Writes domain events to the outbox inside the caller's transaction.

import { EVENT_QUEUES, domainEventSchema, type DomainEventDraft } from '@campusconnect/contracts';
import type { OutboxSqlClient } from './outbox.types';

/**
 * Adds an event to the outbox. Call it in the same transaction as the state change, with the tenant already set,
 * so the event commits or rolls back with the change. Returns the event id, which consumers use for idempotency.
 */
export async function enqueueEvent(
  tx: OutboxSqlClient,
  draft: DomainEventDraft,
  now: () => number = Date.now,
): Promise<string> {
  const occurredAt = now();
  const result = await tx.query<{ id: string }>(
    `INSERT INTO platform.outbox (tenant_id, event_type, event_version, queues, payload, occurred_at)
     VALUES ($1::uuid, $2, $3, $4::text[], $5::jsonb, $6)
     RETURNING id::text AS id`,
    [draft.tenantId, draft.type, draft.version, [...EVENT_QUEUES[draft.type]], JSON.stringify(draft.payload), occurredAt],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('Outbox insert returned no row.');
  // Fail fast on a malformed draft: the same schema is what consumers will apply.
  domainEventSchema.parse({ ...draft, id, occurredAt });
  return id;
}
