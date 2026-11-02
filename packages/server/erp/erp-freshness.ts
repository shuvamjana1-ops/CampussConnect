// Freshness endpoint backing for the admin console (17.6): the warning shows when the latest sync attempt failed.

import { freshnessState } from '@campusconnect/domain/erp';
import { useTenant, type OutboxDatabase } from '../outbox';

export interface ErpFreshness {
  readonly warning: boolean;
  /** ISO-8601 time of the last successful sync, or null if none. */
  readonly lastSuccessAt: string | null;
  readonly stale: boolean;
}

const RECENT_ATTEMPTS = 50;

export class ErpFreshnessService {
  constructor(private readonly db: OutboxDatabase) {}

  async get(tenantId: string): Promise<ErpFreshness> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const attempts = await tx.query<{ at: Date | string; succeeded: boolean }>(
        `SELECT at, succeeded FROM core.erp_sync_attempts
         WHERE tenant_id = $1::uuid ORDER BY at DESC, id DESC LIMIT ${RECENT_ATTEMPTS}`,
        [tenantId],
      );
      const state = await tx.query<{ stale: boolean }>(
        `SELECT stale FROM core.erp_sync_state WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      const result = freshnessState(attempts.rows.map((row) => ({ at: new Date(row.at), succeeded: row.succeeded })));
      return {
        warning: result.warning,
        lastSuccessAt: result.lastSuccessAt?.toISOString() ?? null,
        stale: state.rows[0]?.stale ?? false,
      };
    });
  }
}
