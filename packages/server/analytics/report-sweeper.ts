// Report sweeper (every minute): starts runs for due schedules, retries a failed first attempt once after 10 minutes,
// and notifies the owner after a second failure while keeping the schedule (15.3, 15.6, 15.8).

import type { ReportFormat } from '@campusconnect/contracts';
import { isSuppressed } from '@campusconnect/domain/kanon';
import { reportScopeFilter, type ReportScope } from '@campusconnect/domain/rbac';
import { nextRunAt } from '@campusconnect/domain/schedule';
import { instant, type TenantId, type UserId } from '@campusconnect/domain/types';
import { auditCode, auditRef, type AuditService } from '../audit';
import { useTenant, type OutboxDatabase } from '../outbox';
import { releaseAggregate } from './fact-refresh-job';
import { scheduleOf } from './report-schedule.service';
import type { TenantLister } from './analytics.types';
import {
  REPORT_LINK_TTL_SECONDS,
  REPORT_RETRY_DELAY_MS,
  REPORT_RUN_STALE_MS,
  REPORT_SWEEP_CADENCE_MS,
  type ReportContent,
  type ReportDirectory,
  type ReportNotifier,
  type ReportObjectStore,
  type ReportRenderer,
  type ReportRow,
  type StoredFrequency,
} from './report.types';

const CLAIM_LIMIT = 50;
const MAX_ATTEMPTS = 2;
const INSUFFICIENT = 'Insufficient data' as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<StoredFrequency, number> = { daily: 1, weekly: 7, monthly: 30 };

interface PendingRun {
  runId: string;
  scheduleId: string;
  ownerId: string;
  frequency: StoredFrequency;
  format: ReportFormat;
  recipients: string[];
  attempt: number;
}

interface PendingRunRow {
  run_id: string;
  schedule_id: string;
  owner_id: string;
  frequency: StoredFrequency;
  format: ReportFormat;
  recipients: string[];
  attempt: number;
}

interface AggregateRow {
  department_id: string;
  band: string;
  created: number;
  resolved: number;
  escalated: number;
  breached: number;
}

export interface ReportSweeperOptions {
  readonly onError?: (error: unknown, tenantId: string) => void;
  readonly cadenceMs?: number;
  readonly now?: () => number;
}

export class ReportSweeper {
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;

  constructor(
    private readonly writer: OutboxDatabase,
    private readonly reader: OutboxDatabase,
    private readonly tenants: TenantLister,
    private readonly directory: ReportDirectory,
    private readonly store: ReportObjectStore,
    private readonly renderer: ReportRenderer,
    private readonly notifier: ReportNotifier,
    private readonly audit: AuditService,
    private readonly options: ReportSweeperOptions = {},
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.runOnce(), this.options.cadenceMs ?? REPORT_SWEEP_CADENCE_MS);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Sweeps every Tenant; one Tenant's failure does not stop the others. Returns the number of runs executed. */
  async runOnce(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let executed = 0;
    try {
      for (const tenantId of await this.tenants.listActiveTenantIds()) {
        try {
          const runs = await this.claim(tenantId);
          for (const run of runs) {
            await this.execute(tenantId, run);
            executed += 1;
          }
        } catch (error) {
          this.options.onError?.(error, tenantId);
        }
      }
    } finally {
      this.busy = false;
    }
    return executed;
  }

  private nowMs(): number {
    return (this.options.now ?? Date.now)();
  }

  /** Fails abandoned runs, then claims due schedules (advancing `next_run_at`) and due retries as `running` rows. */
  private async claim(tenantId: string): Promise<PendingRun[]> {
    const nowMs = this.nowMs();
    const timeZone = await this.directory.timeZoneOf(tenantId);
    return this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `UPDATE analytics.report_runs SET outcome = 'failed', finished_at = now(), failure_reason = 'abandoned'
         WHERE outcome = 'running' AND started_at <= to_timestamp(($1::bigint - $2::bigint) / 1000.0)`,
        [nowMs, REPORT_RUN_STALE_MS],
      );

      const due = await tx.query<{ id: string; frequency: StoredFrequency }>(
        `SELECT id::text AS id, frequency FROM analytics.report_schedules
         WHERE next_run_at <= to_timestamp($1::bigint / 1000.0)
         ORDER BY next_run_at LIMIT ${CLAIM_LIMIT} FOR UPDATE SKIP LOCKED`,
        [nowMs],
      );
      for (const schedule of due.rows) {
        const next = nextRunAt(scheduleOf(schedule.frequency), instant(nowMs), timeZone);
        await tx.query(
          `UPDATE analytics.report_schedules SET next_run_at = to_timestamp($2::bigint / 1000.0), updated_at = now()
           WHERE id = $1::uuid`,
          [schedule.id, next],
        );
        await tx.query(
          `INSERT INTO analytics.report_runs (tenant_id, schedule_id, attempt) VALUES (app.tenant(), $1::uuid, 1)`,
          [schedule.id],
        );
      }

      await tx.query(
        `INSERT INTO analytics.report_runs (tenant_id, schedule_id, attempt)
         SELECT f.tenant_id, f.schedule_id, 2 FROM analytics.report_runs f
         WHERE f.outcome = 'failed' AND f.attempt = 1
           AND f.finished_at <= to_timestamp(($1::bigint - $2::bigint) / 1000.0)
           AND NOT EXISTS (SELECT 1 FROM analytics.report_runs r2
                           WHERE r2.tenant_id = f.tenant_id AND r2.schedule_id = f.schedule_id
                             AND r2.attempt = 2 AND r2.started_at >= f.started_at)`,
        [nowMs, REPORT_RETRY_DELAY_MS],
      );

      const pending = await tx.query<PendingRunRow>(
        `SELECT r.id::text AS run_id, r.schedule_id::text AS schedule_id, s.owner_id::text AS owner_id,
                s.frequency, s.format, s.recipients::text[] AS recipients, r.attempt
         FROM analytics.report_runs r
         JOIN analytics.report_schedules s ON s.tenant_id = r.tenant_id AND s.id = r.schedule_id
         WHERE r.outcome = 'running' AND r.finished_at IS NULL
         ORDER BY r.started_at LIMIT ${CLAIM_LIMIT * 2}`,
      );
      return pending.rows.map((r) => ({
        runId: r.run_id,
        scheduleId: r.schedule_id,
        ownerId: r.owner_id,
        frequency: r.frequency,
        format: r.format,
        recipients: r.recipients,
        attempt: r.attempt,
      }));
    });
  }

  private async execute(tenantId: string, run: PendingRun): Promise<void> {
    let scope: ReportScope = { kind: 'none' };
    let objectKey: string | undefined;
    let url: string | undefined;
    let failure: string | undefined;
    try {
      const principal = await this.directory.principalOf(tenantId, run.ownerId);
      if (principal === undefined) throw new Error('owner_unavailable');
      scope = reportScopeFilter(principal);
      if (scope.kind === 'none') throw new Error('scope_none');

      const content = await this.buildContent(tenantId, run.frequency, scope);
      const rendered = await this.renderer.render(run.format, content);
      objectKey = `reports/${tenantId}/${run.scheduleId}/${run.runId}.${rendered.extension}`;
      await this.store.put(objectKey, rendered.body, rendered.contentType);
      url = await this.store.signedUrl(objectKey, REPORT_LINK_TTL_SECONDS);
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
    }

    await this.finish(tenantId, run, scope, failure === undefined ? { objectKey: objectKey ?? '' } : { failure });

    if (failure === undefined && url !== undefined) {
      await this.notifier
        .reportReady({ tenantId, scheduleId: run.scheduleId, recipientIds: run.recipients, url })
        .catch((error: unknown) => this.options.onError?.(error, tenantId));
    } else if (failure !== undefined && run.attempt >= MAX_ATTEMPTS) {
      await this.notifier
        .generationFailed({ tenantId, scheduleId: run.scheduleId, ownerId: run.ownerId })
        .catch((error: unknown) => this.options.onError?.(error, tenantId));
    }
  }

  /** Records the outcome and the audit entry (requester, type, scope, timestamp, outcome) in one transaction. */
  private async finish(
    tenantId: string,
    run: PendingRun,
    scope: ReportScope,
    result: { objectKey: string } | { failure: string },
  ): Promise<void> {
    const nowMs = this.nowMs();
    const ok = 'objectKey' in result;
    await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `UPDATE analytics.report_runs SET outcome = $2, finished_at = now(), object_key = $3, failure_reason = $4
         WHERE id = $1::uuid`,
        [run.runId, ok ? 'succeeded' : 'failed', ok ? result.objectKey : null, ok ? null : result.failure],
      );
      await this.audit.record(tx, tenantId as TenantId, {
        actor: run.ownerId as UserId,
        action: auditCode('report.generated'),
        target: `report_schedule:${auditRef(run.scheduleId)}`,
        outcome: ok ? 'success' : 'failure',
        details: {
          type: auditCode(`${run.frequency}.${run.format}`),
          scope: auditCode(scope.kind),
          run: auditRef(run.runId),
          attempt: auditRef(String(run.attempt)),
        },
        timestampMs: instant(nowMs),
      });
    });
  }

  /** Builds the previous N whole UTC days of aggregates, limited to the owner's scope, with small groups suppressed. */
  private async buildContent(tenantId: string, frequency: StoredFrequency, scope: ReportScope): Promise<ReportContent> {
    const end = new Date(Math.floor(this.nowMs() / DAY_MS) * DAY_MS - DAY_MS);
    const start = new Date(end.getTime() - (PERIOD_DAYS[frequency] - 1) * DAY_MS);
    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);
    const departmentIds = scope.kind === 'departments' ? scope.departmentIds : [];
    const k = await this.directory.kAnonymityOf(tenantId);

    const rows = await this.reader.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const result = await tx.query<AggregateRow>(
        `SELECT department_id::text AS department_id, band,
                sum(created)::int AS created, sum(resolved)::int AS resolved,
                sum(escalated)::int AS escalated, sum(breached)::int AS breached
         FROM analytics.daily_aggregates
         WHERE day BETWEEN $1::date AND $2::date
           AND ($3::boolean OR department_id = ANY($4::uuid[]))
         GROUP BY department_id, band ORDER BY department_id, band`,
        [periodStart, periodEnd, scope.kind === 'all', departmentIds],
      );
      return result.rows;
    });

    const release = (value: number, n: number): number | typeof INSUFFICIENT => {
      return isSuppressed(releaseAggregate(value, n, k)) ? INSUFFICIENT : value;
    };
    const content: ReportRow[] = rows.map((r) => ({
      department: r.department_id,
      band: r.band,
      created: release(r.created, r.created),
      resolved: release(r.resolved, r.created),
      escalated: release(r.escalated, r.created),
      breached: release(r.breached, r.created),
    }));
    return { title: 'CampusConnect report', frequency, periodStart, periodEnd, rows: content };
  }
}
