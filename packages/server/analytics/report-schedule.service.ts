// Schedule endpoints for Dept_Heads and Executives (15.1, 15.2). Validation comes from the catalogue.

import { reportScheduleSchema, validate, type FieldError, type ReportFormat } from '@campusconnect/contracts';
import { reportScopeFilter } from '@campusconnect/domain/rbac';
import { nextRunAt, type Schedule } from '@campusconnect/domain/schedule';
import { instant } from '@campusconnect/domain/types';
import { auditCode, auditRef, type AuditService } from '../audit';
import { useTenant, type OutboxDatabase } from '../outbox';
import {
  ReportPermissionError,
  ReportScheduleNotFoundError,
  ReportValidationError,
  STORED_FREQUENCIES,
  type ReportActor,
  type ReportDirectory,
  type ReportScheduleRecord,
  type StoredFrequency,
} from './report.types';

/** Local time of day a schedule runs at. */
export const REPORT_RUN_TIME = '06:00';

/** The recurring-schedule shape for a stored frequency: daily, Mondays, or the 1st of the month. */
export function scheduleOf(frequency: StoredFrequency): Schedule {
  switch (frequency) {
    case 'daily':
      return { frequency: 'daily', time: REPORT_RUN_TIME };
    case 'weekly':
      return { frequency: 'weekly', weekday: 1, time: REPORT_RUN_TIME };
    case 'monthly':
      return { frequency: 'monthly', dayOfMonth: 1, time: REPORT_RUN_TIME };
  }
}

interface ScheduleRow {
  id: string;
  owner_id: string;
  frequency: StoredFrequency;
  format: ReportFormat;
  recipients: string[];
  next_run_at: Date | string;
}

export function toScheduleRecord(row: ScheduleRow): ReportScheduleRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    frequency: row.frequency,
    format: row.format,
    recipients: row.recipients,
    nextRunAt: new Date(row.next_run_at).getTime(),
  };
}

export class ReportScheduleService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly directory: ReportDirectory,
    private readonly audit: AuditService,
    private readonly now: () => number = Date.now,
  ) {}

  async create(actor: ReportActor, body: unknown): Promise<ReportScheduleRecord> {
    const { principal } = actor;
    const scope = reportScopeFilter(principal);
    if (scope.kind === 'none') throw new ReportPermissionError();

    const candidate = (typeof body === 'object' && body !== null ? body : {}) as { recipients?: unknown };
    const ids = Array.isArray(candidate.recipients)
      ? candidate.recipients.filter((v): v is string => typeof v === 'string')
      : [];
    const known = ids.length > 0 ? await this.directory.tenantUsers(principal.tenantId, ids) : new Set<string>();
    const result = validate(reportScheduleSchema({ isTenantUser: (id) => known.has(id) }), body);
    if (!result.ok) throw new ReportValidationError(result.errors);
    const { frequency, format, recipients } = result.value;
    if (!(STORED_FREQUENCIES as readonly string[]).includes(frequency)) {
      const unsupported: FieldError = { path: 'frequency', rule: 'enum', allowed: STORED_FREQUENCIES };
      throw new ReportValidationError([unsupported]);
    }
    const stored = frequency as StoredFrequency;

    const nowMs = this.now();
    const timeZone = await this.directory.timeZoneOf(principal.tenantId);
    const next = nextRunAt(scheduleOf(stored), instant(nowMs), timeZone);

    return this.db.transaction(async (tx) => {
      await useTenant(tx, principal.tenantId);
      const inserted = await tx.query<ScheduleRow>(
        `INSERT INTO analytics.report_schedules (tenant_id, owner_id, frequency, format, scope, recipients, next_run_at)
         VALUES (app.tenant(), $1::uuid, $2, $3, $4::jsonb, $5::uuid[], to_timestamp($6 / 1000.0))
         RETURNING id::text AS id, owner_id::text AS owner_id, frequency, format, recipients::text[] AS recipients, next_run_at`,
        [principal.userId, stored, format, JSON.stringify(scope), recipients, next],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw new Error('Report schedule insert returned no row.');
      await this.audit.record(tx, principal.tenantId, {
        actor: principal.userId,
        action: auditCode('report.schedule_created'),
        target: `report_schedule:${row.id}`,
        outcome: 'success',
        details: { frequency: auditCode(stored), format: auditCode(format), scope: auditCode(scope.kind) },
        timestampMs: instant(nowMs),
      });
      return toScheduleRecord(row);
    });
  }

  /** The caller's own schedules. */
  async list(actor: ReportActor): Promise<readonly ReportScheduleRecord[]> {
    const { principal } = actor;
    if (reportScopeFilter(principal).kind === 'none') throw new ReportPermissionError();
    return this.db.transaction(async (tx) => {
      await useTenant(tx, principal.tenantId);
      const result = await tx.query<ScheduleRow>(
        `SELECT id::text AS id, owner_id::text AS owner_id, frequency, format, recipients::text[] AS recipients, next_run_at
         FROM analytics.report_schedules WHERE owner_id = $1::uuid ORDER BY created_at`,
        [principal.userId],
      );
      return result.rows.map(toScheduleRecord);
    });
  }

  async remove(actor: ReportActor, scheduleId: string): Promise<void> {
    const { principal } = actor;
    if (reportScopeFilter(principal).kind === 'none') throw new ReportPermissionError();
    const nowMs = this.now();
    await this.db.transaction(async (tx) => {
      await useTenant(tx, principal.tenantId);
      const deleted = await tx.query(
        `DELETE FROM analytics.report_schedules WHERE id = $1::uuid AND owner_id = $2::uuid RETURNING id`,
        [scheduleId, principal.userId],
      );
      if (deleted.rows.length === 0) throw new ReportScheduleNotFoundError();
      await this.audit.record(tx, principal.tenantId, {
        actor: principal.userId,
        action: auditCode('report.schedule_deleted'),
        target: `report_schedule:${auditRef(scheduleId)}`,
        outcome: 'success',
        timestampMs: instant(nowMs),
      });
    });
  }
}
