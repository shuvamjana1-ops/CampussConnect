// Tenant_Admin configuration service. Every call validates through the catalogue before touching the database,
// runs in one Tenant-scoped transaction, and writes its audit entries in that transaction, so a rejected or failed
// change leaves the saved configuration untouched (1.6, 18.1).

import type { FieldError, ValidationResult } from '@campusconnect/contracts';
import type { Instant } from '@campusconnect/domain/types';
import { auditCode, auditRef, type AuditService, type AuditSqlClient } from '../audit';
import {
  validateBand,
  validateBoolean,
  validateDutyRoster,
  validateName,
  validateRateLimit,
  validateRoutingRules,
  validateSlaPolicy,
  validateTenantConfigPatch,
  validateUuid,
  validateWorkingCalendar,
} from './tenant-config';
import {
  ConfigNotFoundError,
  ConfigPermissionError,
  ConfigValidationError,
  TENANT_CONFIG_DEFAULTS,
  type Category,
  type Department,
  type DutyEntry,
  type PriorityBand,
  type RateLimitConfig,
  type RoutingRule,
  type SlaPolicy,
  type TenancyActor,
  type TenancyDatabase,
  type TenantConfig,
  type Weekday,
  type WeeklyHours,
  type WorkingCalendar,
} from './tenancy.types';

const ADMIN_ROLE = 'Tenant_Admin';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

export interface TenancyServiceOptions {
  readonly database: TenancyDatabase;
  readonly audit: AuditService;
  readonly now?: () => Instant;
}

interface ConfigRow {
  time_zone: string;
  region: string;
  confidence_threshold: string | number;
  duplicate_threshold: string | number;
  copilot_confidence_threshold: string | number;
  k_anonymity: number;
  spike_cluster_k: number;
  session_idle_minutes: number;
  sms_enabled: boolean;
  broadcast_approval_required: boolean;
  broadcast_recipient_cap: number;
  executive_digest_weekday: number;
  executive_digest_time: string;
  training_label_opt_in: boolean;
}

const CONFIG_COLUMNS = `time_zone, region, confidence_threshold, duplicate_threshold, copilot_confidence_threshold,
  k_anonymity, spike_cluster_k, session_idle_minutes, sms_enabled, broadcast_approval_required,
  broadcast_recipient_cap, executive_digest_weekday, executive_digest_time, training_label_opt_in`;

/** Column written for each scalar setting. `executiveDigest` is handled separately. */
const SCALAR_COLUMNS: Readonly<Record<Exclude<keyof TenantConfig, 'executiveDigest'>, string>> = {
  timeZone: 'time_zone',
  region: 'region',
  confidenceThreshold: 'confidence_threshold',
  duplicateThreshold: 'duplicate_threshold',
  copilotConfidenceThreshold: 'copilot_confidence_threshold',
  kAnonymity: 'k_anonymity',
  spikeClusterK: 'spike_cluster_k',
  sessionIdleMinutes: 'session_idle_minutes',
  smsEnabled: 'sms_enabled',
  broadcastApprovalRequired: 'broadcast_approval_required',
  broadcastRecipientCap: 'broadcast_recipient_cap',
  trainingLabelOptIn: 'training_label_opt_in',
};

function toConfig(row: ConfigRow): TenantConfig {
  return {
    timeZone: row.time_zone,
    region: row.region,
    confidenceThreshold: Number(row.confidence_threshold),
    duplicateThreshold: Number(row.duplicate_threshold),
    copilotConfidenceThreshold: Number(row.copilot_confidence_threshold),
    kAnonymity: row.k_anonymity,
    spikeClusterK: row.spike_cluster_k,
    sessionIdleMinutes: row.session_idle_minutes,
    smsEnabled: row.sms_enabled,
    broadcastApprovalRequired: row.broadcast_approval_required,
    broadcastRecipientCap: row.broadcast_recipient_cap,
    executiveDigest: { weekday: row.executive_digest_weekday as Weekday, time: row.executive_digest_time },
    trainingLabelOptIn: row.training_label_opt_in,
  };
}

function unwrap<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new ConfigValidationError(result.errors);
  return result.value;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export class TenancyService {
  private readonly database: TenancyDatabase;
  private readonly audit: AuditService;
  private readonly now: () => Instant;

  constructor(options: TenancyServiceOptions) {
    this.database = options.database;
    this.audit = options.audit;
    this.now = options.now ?? ((): Instant => Date.now() as Instant);
  }

  // ---- Tenant settings -------------------------------------------------------------------------------------------

  async getConfig(actor: TenancyActor): Promise<TenantConfig> {
    requireAdmin(actor);
    return this.database.transaction(actor, (tx) => this.readConfig(tx));
  }

  /** Applies a partial update. Invalid values return every field path and nothing is saved (1.6). */
  async updateConfig(actor: TenancyActor, input: unknown): Promise<TenantConfig> {
    requireAdmin(actor);
    const patch = unwrap(validateTenantConfigPatch(input));
    return this.database.transaction(actor, async (tx) => {
      await tx.query('INSERT INTO core.tenant_config (tenant_id) VALUES ($1::uuid) ON CONFLICT (tenant_id) DO NOTHING', [
        actor.tenantId,
      ]);
      const current = toConfig(
        (await tx.query<ConfigRow>(`SELECT ${CONFIG_COLUMNS} FROM core.tenant_config WHERE tenant_id = $1::uuid FOR UPDATE`, [
          actor.tenantId,
        ])).rows[0]!,
      );

      const sets: string[] = [];
      const values: unknown[] = [actor.tenantId];
      const changed: string[] = [];
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'executiveDigest') {
          const digest = value as TenantConfig['executiveDigest'];
          if (digest.weekday !== current.executiveDigest.weekday || digest.time !== current.executiveDigest.time) {
            values.push(digest.weekday, digest.time);
            sets.push(`executive_digest_weekday = $${values.length - 1}`, `executive_digest_time = $${values.length}`);
            changed.push(key);
          }
          continue;
        }
        const name = key as keyof typeof SCALAR_COLUMNS;
        if (current[name] === value) continue;
        values.push(value);
        sets.push(`${SCALAR_COLUMNS[name]} = $${values.length}`);
        changed.push(key);
      }
      if (changed.length === 0) return current;

      const updated = await tx.query<ConfigRow>(
        `UPDATE core.tenant_config SET ${sets.join(', ')}, updated_at = now()
         WHERE tenant_id = $1::uuid RETURNING ${CONFIG_COLUMNS}`,
        values,
      );
      for (const key of changed) await this.record(tx, actor, 'tenant_config.updated', `tenant_config:${key}`);
      return toConfig(updated.rows[0]!);
    });
  }

  private async readConfig(tx: AuditSqlClient): Promise<TenantConfig> {
    const result = await tx.query<ConfigRow>(`SELECT ${CONFIG_COLUMNS} FROM core.tenant_config`);
    const row = result.rows[0];
    return row === undefined ? TENANT_CONFIG_DEFAULTS : toConfig(row);
  }

  // ---- Departments and duty rosters ------------------------------------------------------------------------------

  async listDepartments(actor: TenancyActor): Promise<Department[]> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) =>
      (await tx.query<Department>('SELECT id::text AS id, name, active FROM core.departments ORDER BY lower(name)')).rows,
    );
  }

  async createDepartment(actor: TenancyActor, input: unknown): Promise<Department> {
    requireAdmin(actor);
    const body = objectOf(input);
    const name = unwrap(validateName('name', body['name']));
    return this.database.transaction(actor, async (tx) => {
      const row = await guarded('name', () =>
        tx.query<Department>(
          `INSERT INTO core.departments (tenant_id, name) VALUES ($1::uuid, $2)
           RETURNING id::text AS id, name, active`,
          [actor.tenantId, name],
        ),
      );
      const department = row.rows[0]!;
      await this.record(tx, actor, 'department.created', `department:${department.id}`);
      return department;
    });
  }

  /** Renames or (de)activates a department. Departments are never deleted because Tickets refer to them. */
  async updateDepartment(actor: TenancyActor, id: unknown, input: unknown): Promise<Department> {
    requireAdmin(actor);
    const departmentId = unwrap(validateUuid('id', id));
    const body = objectOf(input);
    const errors: FieldError[] = unknownKeys(body, ['name', 'active']);
    const name = body['name'] === undefined ? undefined : collect(validateName('name', body['name']), errors);
    const active = body['active'] === undefined ? undefined : collect(validateBoolean('active', body['active']), errors);
    if (errors.length > 0) throw new ConfigValidationError(errors);
    return this.database.transaction(actor, async (tx) => {
      const result = await guarded('name', () =>
        tx.query<Department>(
          `UPDATE core.departments SET name = COALESCE($2, name), active = COALESCE($3, active), updated_at = now()
           WHERE id = $1::uuid RETURNING id::text AS id, name, active`,
          [departmentId, name ?? null, active ?? null],
        ),
      );
      const department = result.rows[0];
      if (department === undefined) throw new ConfigNotFoundError();
      await this.record(tx, actor, 'department.updated', `department:${department.id}`);
      return department;
    });
  }

  async getDutyRoster(actor: TenancyActor, departmentId: unknown): Promise<DutyEntry[]> {
    requireAdmin(actor);
    const id = unwrap(validateUuid('departmentId', departmentId));
    return this.database.transaction(actor, async (tx) =>
      (await tx.query<{ userId: string; onDuty: boolean }>(
        `SELECT user_id::text AS "userId", on_duty AS "onDuty" FROM core.department_duty
         WHERE department_id = $1::uuid ORDER BY user_id`,
        [id],
      )).rows,
    );
  }

  /** Replaces the whole roster of the department. */
  async setDutyRoster(actor: TenancyActor, departmentId: unknown, input: unknown): Promise<DutyEntry[]> {
    requireAdmin(actor);
    const id = unwrap(validateUuid('departmentId', departmentId));
    const roster = unwrap(validateDutyRoster(input));
    return this.database.transaction(actor, async (tx) => {
      await this.requireRow(tx, 'SELECT 1 FROM core.departments WHERE id = $1::uuid', [id]);
      await tx.query('DELETE FROM core.department_duty WHERE department_id = $1::uuid', [id]);
      for (const entry of roster) {
        await tx.query(
          'INSERT INTO core.department_duty (tenant_id, department_id, user_id, on_duty) VALUES ($1::uuid, $2::uuid, $3::uuid, $4)',
          [actor.tenantId, id, entry.userId, entry.onDuty],
        );
      }
      await this.record(tx, actor, 'department_duty.replaced', `department:${id}`);
      return roster.map((entry) => ({ ...entry }));
    });
  }

  // ---- Categories and routing rules ------------------------------------------------------------------------------

  async listCategories(actor: TenancyActor): Promise<Category[]> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) => (await tx.query<CategoryRow>(CATEGORY_SELECT + ' ORDER BY lower(name)')).rows.map(toCategory));
  }

  async createCategory(actor: TenancyActor, input: unknown): Promise<Category> {
    requireAdmin(actor);
    const body = objectOf(input);
    const errors = unknownKeys(body, ['name', 'defaultDepartmentId', 'defaultBand', 'active']);
    const name = collect(validateName('name', body['name']), errors);
    const departmentId = optional(body['defaultDepartmentId'], (v) => validateUuid('defaultDepartmentId', v), errors);
    const band = optional(body['defaultBand'], (v) => validateBand('defaultBand', v), errors) ?? 'P2';
    const active = optional(body['active'], (v) => validateBoolean('active', v), errors) ?? true;
    if (errors.length > 0) throw new ConfigValidationError(errors);
    return this.database.transaction(actor, async (tx) => {
      const result = await guarded('defaultDepartmentId', () =>
        tx.query<CategoryRow>(
          `INSERT INTO core.categories (tenant_id, name, default_department_id, default_band, active)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5)
           RETURNING id::text AS id, name, default_department_id::text AS default_department_id, default_band, active`,
          [actor.tenantId, name, departmentId ?? null, band, active],
        ),
      );
      const category = toCategory(result.rows[0]!);
      await this.record(tx, actor, 'category.created', `category:${category.id}`);
      return category;
    });
  }

  async updateCategory(actor: TenancyActor, id: unknown, input: unknown): Promise<Category> {
    requireAdmin(actor);
    const categoryId = unwrap(validateUuid('id', id));
    const body = objectOf(input);
    const errors = unknownKeys(body, ['name', 'defaultDepartmentId', 'defaultBand', 'active']);
    const name = optional(body['name'], (v) => validateName('name', v), errors);
    const departmentId = optional(body['defaultDepartmentId'], (v) => validateUuid('defaultDepartmentId', v), errors);
    const band = optional(body['defaultBand'], (v) => validateBand('defaultBand', v), errors);
    const active = optional(body['active'], (v) => validateBoolean('active', v), errors);
    if (errors.length > 0) throw new ConfigValidationError(errors);
    return this.database.transaction(actor, async (tx) => {
      const result = await guarded('defaultDepartmentId', () =>
        tx.query<CategoryRow>(
          `UPDATE core.categories SET name = COALESCE($2, name),
             default_department_id = COALESCE($3::uuid, default_department_id),
             default_band = COALESCE($4, default_band), active = COALESCE($5, active), updated_at = now()
           WHERE id = $1::uuid
           RETURNING id::text AS id, name, default_department_id::text AS default_department_id, default_band, active`,
          [categoryId, name ?? null, departmentId ?? null, band ?? null, active ?? null],
        ),
      );
      const row = result.rows[0];
      if (row === undefined) throw new ConfigNotFoundError();
      await this.record(tx, actor, 'category.updated', `category:${categoryId}`);
      return toCategory(row);
    });
  }

  async listRoutingRules(actor: TenancyActor): Promise<RoutingRule[]> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) => (await tx.query<RoutingRuleRow>(ROUTING_SELECT)).rows.map(toRoutingRule));
  }

  /** Replaces the ordered rule list. A rule's rank is its position in the submitted list. */
  async replaceRoutingRules(actor: TenancyActor, input: unknown): Promise<RoutingRule[]> {
    requireAdmin(actor);
    const rules = unwrap(validateRoutingRules(input));
    return this.database.transaction(actor, async (tx) => {
      await tx.query('DELETE FROM core.routing_rules');
      for (const [rank, rule] of rules.entries()) {
        await guarded(`${rank}.categoryId`, () =>
          tx.query(
            `INSERT INTO core.routing_rules (tenant_id, category_id, keywords, department_id, rank)
             VALUES ($1::uuid, $2::uuid, $3::text[], $4::uuid, $5)`,
            [actor.tenantId, rule.categoryId, rule.keywords, rule.departmentId, rank],
          ),
        );
      }
      await this.record(tx, actor, 'routing_rules.replaced', 'routing_rules:all');
      return (await tx.query<RoutingRuleRow>(ROUTING_SELECT)).rows.map(toRoutingRule);
    });
  }

  // ---- SLA policies, calendar and rate limits --------------------------------------------------------------------

  async listSlaPolicies(actor: TenancyActor): Promise<SlaPolicy[]> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) => (await tx.query<SlaRow>(SLA_SELECT + ' ORDER BY band, category_id NULLS FIRST')).rows.map(toSla));
  }

  /** Creates or replaces the policy for a band, or for a band and category. */
  async upsertSlaPolicy(actor: TenancyActor, input: unknown): Promise<SlaPolicy> {
    requireAdmin(actor);
    const policy = unwrap(validateSlaPolicy(input));
    return this.database.transaction(actor, async (tx) => {
      const values = [policy.firstResponseMin, policy.resolutionMin, policy.l1Min, policy.l2Min];
      const match =
        policy.categoryId === undefined
          ? { where: 'band = $1 AND category_id IS NULL', params: [policy.band] }
          : { where: 'band = $1 AND category_id = $2::uuid', params: [policy.band, policy.categoryId] };
      const base = match.params.length;
      const updated = await tx.query<SlaRow>(
        `UPDATE core.sla_policies SET first_response_min = $${base + 1}, resolution_min = $${base + 2},
           l1_min = $${base + 3}, l2_min = $${base + 4}, updated_at = now()
         WHERE ${match.where} RETURNING ${SLA_COLUMNS}`,
        [...match.params, ...values],
      );
      let row = updated.rows[0];
      if (row === undefined) {
        row = (await guarded('categoryId', () =>
          tx.query<SlaRow>(
            `INSERT INTO core.sla_policies (tenant_id, band, category_id, first_response_min, resolution_min, l1_min, l2_min)
             VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7) RETURNING ${SLA_COLUMNS}`,
            [actor.tenantId, policy.band, policy.categoryId ?? null, ...values],
          ),
        )).rows[0]!;
      }
      await this.record(tx, actor, 'sla_policy.upserted', `sla_policy:${row.id}`);
      return toSla(row);
    });
  }

  async getWorkingCalendar(actor: TenancyActor): Promise<WorkingCalendar | undefined> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) => {
      const row = (await tx.query<CalendarRow>(CALENDAR_SELECT)).rows[0];
      return row === undefined ? undefined : toCalendar(row);
    });
  }

  /** Replaces the calendar and increments its version. The calendar is never deleted (G8). */
  async replaceWorkingCalendar(actor: TenancyActor, input: unknown): Promise<WorkingCalendar> {
    requireAdmin(actor);
    const calendar = unwrap(validateWorkingCalendar(input));
    return this.database.transaction(actor, async (tx) => {
      const params = [calendar.timeZone, JSON.stringify(calendar.weekly), calendar.holidays];
      const updated = await tx.query<CalendarRow>(
        `UPDATE core.working_calendars SET time_zone = $1, weekly = $2::jsonb, holidays = $3::date[],
           version = version + 1, updated_at = now()
         WHERE tenant_id = $4::uuid RETURNING ${CALENDAR_COLUMNS}`,
        [...params, actor.tenantId],
      );
      const row =
        updated.rows[0] ??
        (await tx.query<CalendarRow>(
          `INSERT INTO core.working_calendars (tenant_id, time_zone, weekly, holidays)
           VALUES ($4::uuid, $1, $2::jsonb, $3::date[]) RETURNING ${CALENDAR_COLUMNS}`,
          [...params, actor.tenantId],
        )).rows[0]!;
      await this.record(tx, actor, 'working_calendar.replaced', 'working_calendar:current');
      return toCalendar(row);
    });
  }

  async listRateLimits(actor: TenancyActor): Promise<RateLimitConfig[]> {
    requireAdmin(actor);
    return this.database.transaction(actor, async (tx) =>
      (await tx.query<RateLimitConfig>(
        'SELECT scope, request_limit AS "limit", window_sec AS "windowSec" FROM core.rate_limit_config ORDER BY scope',
      )).rows,
    );
  }

  async setRateLimit(actor: TenancyActor, input: unknown): Promise<RateLimitConfig> {
    requireAdmin(actor);
    const limit = unwrap(validateRateLimit(input));
    return this.database.transaction(actor, async (tx) => {
      await tx.query(
        `INSERT INTO core.rate_limit_config (tenant_id, scope, request_limit, window_sec)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (tenant_id, scope) DO UPDATE SET request_limit = EXCLUDED.request_limit,
           window_sec = EXCLUDED.window_sec, updated_at = now()`,
        [actor.tenantId, limit.scope, limit.limit, limit.windowSec],
      );
      await this.record(tx, actor, 'rate_limit.updated', `rate_limit:${limit.scope}`);
      return limit;
    });
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------------

  private async record(tx: AuditSqlClient, actor: TenancyActor, action: string, target: string): Promise<void> {
    await this.audit.record(tx, actor.tenantId, {
      actor: actor.userId,
      role: auditCode(ADMIN_ROLE),
      action: auditCode(action),
      target,
      outcome: 'success',
      details: { tenant: auditRef(actor.tenantId) },
      timestampMs: this.now(),
    });
  }

  private async requireRow(tx: AuditSqlClient, text: string, values: readonly unknown[]): Promise<void> {
    if ((await tx.query(text, values)).rows.length === 0) throw new ConfigNotFoundError();
  }

}

/** Turns foreign-key and uniqueness failures into field errors for `path`. The caller's transaction rolls back. */
async function guarded<T>(path: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = errorCode(error);
    if (code === FOREIGN_KEY_VIOLATION) throw new ConfigValidationError([{ path, rule: 'invalid' }]);
    if (code === UNIQUE_VIOLATION) throw new ConfigValidationError([{ path, rule: 'distinct' }]);
    throw error;
  }
}

function requireAdmin(actor: TenancyActor): void {
  if (!actor.roles.includes(ADMIN_ROLE)) throw new ConfigPermissionError();
}

function objectOf(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) return input as Record<string, unknown>;
  throw new ConfigValidationError([{ path: '', rule: input === undefined ? 'required' : 'type', expected: 'object' }]);
}

function unknownKeys(body: Record<string, unknown>, known: readonly string[]): FieldError[] {
  return Object.keys(body)
    .filter((key) => !known.includes(key))
    .map((key): FieldError => ({ path: key, rule: 'unknown_field' }));
}

/** Returns the value of a valid result, or pushes its errors and returns undefined. */
function collect<T>(result: ValidationResult<T>, errors: FieldError[]): T | undefined {
  if (result.ok) return result.value;
  errors.push(...result.errors);
  return undefined;
}

function optional<T>(value: unknown, check: (v: unknown) => ValidationResult<T>, errors: FieldError[]): T | undefined {
  return value === undefined ? undefined : collect(check(value), errors);
}

// ---- Row mapping ---------------------------------------------------------------------------------------------------

interface CategoryRow {
  id: string;
  name: string;
  default_department_id: string | null;
  default_band: PriorityBand;
  active: boolean;
}

const CATEGORY_SELECT = `SELECT id::text AS id, name, default_department_id::text AS default_department_id, default_band, active
  FROM core.categories`;

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    defaultDepartmentId: row.default_department_id ?? undefined,
    defaultBand: row.default_band,
    active: row.active,
  };
}

interface RoutingRuleRow {
  id: string;
  category_id: string;
  keywords: string[];
  department_id: string;
  rank: number;
}

const ROUTING_SELECT = `SELECT id::text AS id, category_id::text AS category_id, keywords, department_id::text AS department_id, rank
  FROM core.routing_rules ORDER BY rank`;

function toRoutingRule(row: RoutingRuleRow): RoutingRule {
  return { id: row.id, categoryId: row.category_id, keywords: row.keywords, departmentId: row.department_id, rank: row.rank };
}

interface SlaRow {
  id: string;
  band: PriorityBand;
  category_id: string | null;
  first_response_min: number;
  resolution_min: number;
  l1_min: number;
  l2_min: number;
}

const SLA_COLUMNS = 'id::text AS id, band, category_id::text AS category_id, first_response_min, resolution_min, l1_min, l2_min';
const SLA_SELECT = `SELECT ${SLA_COLUMNS} FROM core.sla_policies`;

function toSla(row: SlaRow): SlaPolicy {
  return {
    id: row.id,
    band: row.band,
    categoryId: row.category_id ?? undefined,
    firstResponseMin: row.first_response_min,
    resolutionMin: row.resolution_min,
    l1Min: row.l1_min,
    l2Min: row.l2_min,
  };
}

interface CalendarRow {
  time_zone: string;
  weekly: WeeklyHours;
  holidays: string[];
  version: number;
}

const CALENDAR_COLUMNS = `time_zone, weekly,
  ARRAY(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(holidays) AS d ORDER BY d) AS holidays, version`;
const CALENDAR_SELECT = `SELECT ${CALENDAR_COLUMNS} FROM core.working_calendars`;

function toCalendar(row: CalendarRow): WorkingCalendar {
  return { timeZone: row.time_zone, weekly: row.weekly, holidays: row.holidays, version: row.version };
}
