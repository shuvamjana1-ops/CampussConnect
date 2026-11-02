// Daily retention job (19.5): selects expired items with `selectExpired` and disposes of them per Tenant policy.

import {
  selectExpired,
  type RetentionItem,
  type RetentionPolicy,
} from '@campusconnect/domain/retention';
import { useTenant, type OutboxDatabase, type OutboxSqlClient } from '../outbox/outbox.types';

/** Implemented per item type (tickets, attachments, Copilot conversations, documents, audit, notifications). */
export interface RetentionSource {
  readonly itemType: string;
  /** Lists candidate items for the Tenant; may be paged by the implementation. */
  list(tx: OutboxSqlClient, tenantId: string, now: Date): Promise<readonly RetentionItem[]>;
  dispose(tx: OutboxSqlClient, tenantId: string, ids: readonly string[], action: 'delete' | 'anonymise'): Promise<void>;
}

/** The job runs at least daily so items are gone within 24 hours of expiry. */
export const RETENTION_JOB_CADENCE_MS = 24 * 60 * 60 * 1000;

export class RetentionJob {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly sources: readonly RetentionSource[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertPolicy(tenantId: string, policy: Required<RetentionPolicy>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `INSERT INTO privacy.retention_policies (tenant_id, item_type, retain_days, action)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (tenant_id, item_type) DO UPDATE
           SET retain_days = EXCLUDED.retain_days, action = EXCLUDED.action, updated_at = now()`,
        [tenantId, policy.itemType, policy.retainDays, policy.action],
      );
    });
  }

  /** Runs every source for one Tenant; each source commits independently so one failure does not block the rest. */
  async runTenant(tenantId: string): Promise<Readonly<Record<string, number>>> {
    const now = this.now();
    const policies = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<{ item_type: string; retain_days: number; action: 'delete' | 'anonymise' }>(
        `SELECT item_type, retain_days, action FROM privacy.retention_policies WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      return rows.rows.map((r): RetentionPolicy => ({ itemType: r.item_type, retainDays: r.retain_days, action: r.action }));
    });

    const disposed: Record<string, number> = {};
    for (const source of this.sources) {
      const action = policies.find((p) => p.itemType === source.itemType)?.action ?? 'delete';
      disposed[source.itemType] = await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        const items = await source.list(tx, tenantId, now);
        const expired = selectExpired(items, policies, now);
        if (expired.length > 0) {
          await source.dispose(tx, tenantId, expired.map((i) => i.id), action);
        }
        await tx.query(
          `INSERT INTO privacy.retention_runs (tenant_id, item_type, disposed) VALUES ($1::uuid, $2, $3)`,
          [tenantId, source.itemType, expired.length],
        );
        return expired.length;
      });
    }
    return disposed;
  }
}
