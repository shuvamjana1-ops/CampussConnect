// Refresh job (every 5 minutes): reads the fact tables on the Aurora reader and rebuilds the daily aggregates on the
// writer. It also exposes fact loaders that map rows to the pure metric inputs in `domain/analytics`, with the
// k-anonymity gateway applied to anything released.

import type { ActivityCounts, PriorityBand, TicketFact } from '@campusconnect/domain/analytics';
import { suppressAggregate, type SuppressResult } from '@campusconnect/domain/kanon';
import { useTenant, type OutboxDatabase, type OutboxSqlClient } from '../outbox';
import { FACT_REFRESH_CADENCE_MS, type TenantLister } from './analytics.types';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface FactRow {
  department_id: string | null;
  category_id: string;
  band: PriorityBand;
  routed: boolean;
  reassigned_department: boolean;
  escalation_level: 0 | 1 | 2 | 3;
  resolved: boolean;
  closed: boolean;
  withdrawn: boolean;
  breached: boolean;
  resolved_within_sla: boolean;
  disputed: boolean;
  reopened: boolean;
  disputed_or_reopened_within_7d: boolean;
  first_response_hours: string | null;
  csat: number | null;
  closed_at: Date | string | null;
}

export interface FactRefreshJobOptions {
  readonly onError?: (error: unknown, tenantId: string) => void;
  readonly cadenceMs?: number;
}

export class FactRefreshJob {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly reader: OutboxDatabase,
    private readonly writer: OutboxDatabase,
    private readonly tenants: TenantLister,
    private readonly options: FactRefreshJobOptions = {},
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.runOnce(), this.options.cadenceMs ?? FACT_REFRESH_CADENCE_MS);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Refreshes every Tenant; one Tenant's failure does not stop the others. Returns the count refreshed. */
  async runOnce(): Promise<number> {
    let refreshed = 0;
    for (const tenantId of await this.tenants.listActiveTenantIds()) {
      try {
        await this.refreshTenant(tenantId);
        refreshed += 1;
      } catch (error) {
        this.options.onError?.(error, tenantId);
      }
    }
    return refreshed;
  }

  async refreshTenant(tenantId: string): Promise<void> {
    const rows = await this.reader.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const result = await tx.query<AggregateRow>(
        `SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
                COALESCE(department_id, $1::uuid) AS department_id, category_id, band,
                count(*)::int AS created,
                count(*) FILTER (WHERE routed)::int AS routed,
                count(*) FILTER (WHERE reassigned_department)::int AS reassigned,
                count(*) FILTER (WHERE escalation_level >= 1)::int AS escalated,
                count(*) FILTER (WHERE resolved)::int AS resolved,
                count(*) FILTER (WHERE closed)::int AS closed,
                count(*) FILTER (WHERE withdrawn)::int AS withdrawn,
                count(*) FILTER (WHERE breached)::int AS breached,
                count(*) FILTER (WHERE disputed)::int AS disputed,
                count(*) FILTER (WHERE reopened)::int AS reopened
         FROM analytics.ticket_facts
         GROUP BY 1, 2, 3, 4`,
        [NIL_UUID],
      );
      return result.rows;
    });
    await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      for (const r of rows) {
        await tx.query(
          `INSERT INTO analytics.daily_aggregates
             (tenant_id, day, department_id, category_id, band, created, routed, reassigned, escalated, resolved,
              closed, withdrawn, breached, disputed, reopened, refreshed_at)
           VALUES (app.tenant(), $1::date, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
           ON CONFLICT (tenant_id, day, department_id, category_id, band) DO UPDATE SET
             created = EXCLUDED.created, routed = EXCLUDED.routed, reassigned = EXCLUDED.reassigned,
             escalated = EXCLUDED.escalated, resolved = EXCLUDED.resolved, closed = EXCLUDED.closed,
             withdrawn = EXCLUDED.withdrawn, breached = EXCLUDED.breached, disputed = EXCLUDED.disputed,
             reopened = EXCLUDED.reopened, refreshed_at = now()`,
          [r.day, r.department_id, r.category_id, r.band, r.created, r.routed, r.reassigned, r.escalated,
            r.resolved, r.closed, r.withdrawn, r.breached, r.disputed, r.reopened],
        );
      }
    });
  }
}

interface AggregateRow {
  day: string;
  department_id: string;
  category_id: string;
  band: PriorityBand;
  created: number;
  routed: number;
  reassigned: number;
  escalated: number;
  resolved: number;
  closed: number;
  withdrawn: number;
  breached: number;
  disputed: number;
  reopened: number;
}

/** Loads a Tenant's Ticket facts as `domain/analytics` inputs. Pass a reader transaction. */
export async function loadTicketFacts(tx: OutboxSqlClient, tenantId: string): Promise<TicketFact[]> {
  await useTenant(tx, tenantId);
  const result = await tx.query<FactRow>('SELECT * FROM analytics.ticket_facts');
  return result.rows.map((r) => ({
    department: r.department_id ?? NIL_UUID,
    category: r.category_id,
    band: r.band,
    routed: r.routed,
    reassignedDepartment: r.reassigned_department,
    escalationLevel: r.escalation_level,
    closed: r.closed,
    withdrawn: r.withdrawn,
    resolved: r.resolved,
    breached: r.breached,
    resolvedWithinSla: r.resolved_within_sla,
    disputedOrReopenedWithin7d: r.disputed_or_reopened_within_7d,
    disputed: r.disputed,
    reopened: r.reopened,
    ...(r.closed_at === null ? {} : { closedAtMs: new Date(r.closed_at).getTime() }),
    ...(r.first_response_hours === null ? {} : { firstResponseHours: Number(r.first_response_hours) }),
    ...(r.csat === null ? {} : { csat: r.csat }),
  }));
}

/**
 * Weekly, monthly and activation counts from the sign-in facts. Windows end at `now` (UTC days). `enrolled` is the
 * count of active Students supplied by the caller from the ERP module.
 */
export async function loadActivityCounts(
  tx: OutboxSqlClient,
  tenantId: string,
  now: Date,
  enrolled: number,
): Promise<ActivityCounts> {
  await useTenant(tx, tenantId);
  const result = await tx.query<{ weekly: number; monthly: number; activated: number }>(
    `SELECT count(DISTINCT actor_key) FILTER (WHERE day > $1::date - 7)::int AS weekly,
            count(DISTINCT actor_key) FILTER (WHERE day > $1::date - 30)::int AS monthly,
            count(DISTINCT actor_key)::int AS activated
     FROM analytics.signin_facts WHERE role_class = 'student' AND day <= $1::date`,
    [now.toISOString()],
  );
  const row = result.rows[0] ?? { weekly: 0, monthly: 0, activated: 0 };
  return { weeklyActive: row.weekly, monthlyActive: row.monthly, activated: row.activated, enrolled };
}

/** Releases an aggregate only when it covers at least `max(5, kAnonymity)` distinct subjects. */
export function releaseAggregate<T>(value: T, n: number, kAnonymity: number): SuppressResult<T> {
  return suppressAggregate({ value, n }, kAnonymity);
}
