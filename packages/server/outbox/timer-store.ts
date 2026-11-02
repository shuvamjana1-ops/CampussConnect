// Timer rows: upsert with generation, and cancel.

import type { OutboxSqlClient } from './outbox.types';

export interface TimerKey {
  readonly tenantId: string;
  readonly ticketId: string;
  readonly kind: string;
}

/**
 * Creates the timer or moves its deadline. Every call increments `generation`, so a message already queued for an
 * earlier deadline is ignored by its handler. Call inside the transaction that recalculates the clock, tenant set.
 * Returns the new generation.
 */
export async function upsertTimer(tx: OutboxSqlClient, key: TimerKey, dueAtMs: number): Promise<number> {
  const result = await tx.query<{ generation: number }>(
    `INSERT INTO platform.timers (tenant_id, ticket_id, kind, due_at)
     VALUES ($1::uuid, $2::uuid, $3, to_timestamp($4::double precision / 1000.0))
     ON CONFLICT (tenant_id, ticket_id, kind) DO UPDATE SET
       due_at = EXCLUDED.due_at,
       generation = platform.timers.generation + 1,
       claimed_until = NULL,
       enqueued_generation = NULL,
       updated_at = now()
     RETURNING generation`,
    [key.tenantId, key.ticketId, key.kind, dueAtMs],
  );
  const generation = result.rows[0]?.generation;
  if (generation === undefined) throw new Error('Timer upsert returned no row.');
  return generation;
}

/** Removes a timer, e.g. when a clock stops. Queued messages for it find no row and are ignored. */
export async function cancelTimer(tx: OutboxSqlClient, key: TimerKey): Promise<void> {
  await tx.query(`DELETE FROM platform.timers WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND kind = $3`, [
    key.tenantId,
    key.ticketId,
    key.kind,
  ]);
}
