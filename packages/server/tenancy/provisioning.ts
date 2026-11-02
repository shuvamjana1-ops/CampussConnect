// Tenant provisioning saga (requirements 1.7, 1.8, 1.9, 22.3).
//
// Steps: (1) Tenant KMS data key and signing key; (2) one database transaction with the tenant row and defaults;
// (3) registry entry and DNS record. A failure or the 25-second deadline compensates the completed steps in reverse
// order. The failure is reported to the requester and audited in a separate transaction.

import { randomUUID } from 'node:crypto';
import type { FieldError, ValidationResult } from '@campusconnect/contracts';
import { instant, tenantId as toTenantId, type Instant, type TenantId } from '@campusconnect/domain/types';
import { auditCode, auditRef, type AuditService, type AuditSqlClient } from '../audit';
import { isIanaTimeZone } from './tenant-config';
import { ConfigValidationError, PRIORITY_BANDS, TENANT_CONFIG_DEFAULTS, type PriorityBand } from './tenancy.types';

export const PROVISIONING_DEADLINE_MS = 25_000;
export const DEFAULT_REGION = 'ap-south-1';

/** The six Tenant roles (2.2) provisioned for every Tenant. */
export const DEFAULT_ROLES = ['student', 'handler', 'dept_head', 'executive', 'ombudsperson', 'tenant_admin'] as const;

/** Default categories. Departments are a placeholder until the Tenant_Admin creates them, so none is assigned. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ readonly name: string; readonly band: PriorityBand }> = [
  { name: 'Academics', band: 'P2' },
  { name: 'Examinations', band: 'P1' },
  { name: 'Fees and Finance', band: 'P2' },
  { name: 'Hostel', band: 'P2' },
  { name: 'Library', band: 'P3' },
  { name: 'IT and Network', band: 'P2' },
  { name: 'Placement', band: 'P2' },
  { name: 'Health and Safety', band: 'P0' },
  { name: 'Administration', band: 'P3' },
  { name: 'Other', band: 'P3' },
];

/** Default SLA policies in minutes (design table; a Working_Day is 480 working minutes). */
export const DEFAULT_SLA_POLICIES: Readonly<
  Record<PriorityBand, { readonly firstResponseMin: number; readonly resolutionMin: number; readonly l1Min: number; readonly l2Min: number }>
> = {
  P0: { firstResponseMin: 60, resolutionMin: 1440, l1Min: 240, l2Min: 480 },
  P1: { firstResponseMin: 240, resolutionMin: 960, l1Min: 480, l2Min: 960 },
  P2: { firstResponseMin: 480, resolutionMin: 2400, l1Min: 960, l2Min: 1440 },
  P3: { firstResponseMin: 960, resolutionMin: 4800, l1Min: 1440, l2Min: 2400 },
};

/** Monday to Friday, 09:00 to 17:00 (keys are ISO weekdays). */
export const DEFAULT_WEEKLY_HOURS = Object.freeze({
  1: [{ start: '09:00', end: '17:00' }],
  2: [{ start: '09:00', end: '17:00' }],
  3: [{ start: '09:00', end: '17:00' }],
  4: [{ start: '09:00', end: '17:00' }],
  5: [{ start: '09:00', end: '17:00' }],
});

// ---- Ports --------------------------------------------------------------------------------------------------------

export interface TenantKeys {
  readonly dataKeyId: string;
  readonly signingKeyId: string;
}

/** Creates and schedules deletion of the Tenant's KMS keys (a symmetric data key and an ECC_NIST_P256 signing key). */
export interface KeyService {
  createTenantKeys(tenantId: TenantId, region: string): Promise<TenantKeys>;
  /** Idempotent. */
  scheduleKeyDeletion(keys: TenantKeys, region: string): Promise<void>;
}

export interface TenantRegistryEntry {
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly region: string;
}

/** The global Tenant registry (DynamoDB). */
export interface TenantRegistry {
  register(entry: TenantRegistryEntry): Promise<void>;
  /** Idempotent. */
  remove(tenantId: TenantId): Promise<void>;
}

/** Route 53. */
export interface DnsService {
  createRecord(slug: string, region: string): Promise<void>;
  /** Idempotent. */
  deleteRecord(slug: string, region: string): Promise<void>;
}

/** Opens a transaction with `app.tenant_id` set to the Tenant being provisioned. */
export interface ProvisioningDatabase {
  transaction<T>(tenantId: TenantId, fn: (tx: AuditSqlClient) => Promise<T>): Promise<T>;
}

/** A platform operator, authenticated outside Tenant RBAC (G3). */
export interface OperatorPrincipal {
  readonly kind: 'platform_operator';
  readonly operatorId: string;
}

// ---- Request, result, errors --------------------------------------------------------------------------------------

export interface ProvisionTenantRequest {
  readonly name: string;
  readonly slug: string;
  readonly region: string;
  readonly timeZone: string;
}

export interface ProvisionedTenant {
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly region: string;
  readonly timeZone: string;
}

export type ProvisioningStep = 'keys' | 'database' | 'registry' | 'audit' | 'deadline';

/** Reported to the requester when provisioning fails. Everything created has been compensated. Maps to 502. */
export class ProvisioningFailedError extends Error {
  readonly code = 'PROVISIONING_FAILED' as const;

  constructor(
    readonly step: ProvisioningStep,
    readonly tenantId: TenantId,
    /** False when the failure audit entry could not be written. */
    readonly audited: boolean,
    /** Compensations that themselves failed and need operator follow-up. */
    readonly compensationFailures: number,
    options?: { cause?: unknown },
  ) {
    super(`Tenant provisioning failed at step "${step}" and was rolled back.`, options);
    this.name = 'ProvisioningFailedError';
  }
}

/** Thrown when the caller is not an authenticated platform operator. Maps to 401. */
export class OperatorAuthenticationError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED' as const;

  constructor() {
    super('A platform operator credential is required.');
    this.name = 'OperatorAuthenticationError';
  }
}

class DeadlineError extends Error {
  constructor() {
    super('Provisioning deadline exceeded.');
    this.name = 'DeadlineError';
  }
}

// ---- Validation ---------------------------------------------------------------------------------------------------

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const ALLOWED_KEYS = new Set(['name', 'slug', 'region', 'timeZone']);

export function validateProvisionRequest(input: unknown): ValidationResult<ProvisionTenantRequest> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', rule: 'type', expected: 'object' }] };
  }
  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(body)) if (!ALLOWED_KEYS.has(key)) errors.push({ path: key, rule: 'unknown_field' });

  const name = body['name'];
  if (typeof name !== 'string') errors.push({ path: 'name', rule: 'type', expected: 'string' });
  else if (name.trim().length < 1 || name.length > 200) errors.push({ path: 'name', rule: 'length', min: 1, max: 200 });

  const slug = body['slug'];
  if (typeof slug !== 'string') errors.push({ path: 'slug', rule: 'type', expected: 'string' });
  else if (!SLUG.test(slug)) errors.push({ path: 'slug', rule: 'format', expected: 'lower-case letters, digits and hyphens, 1 to 63 characters' });

  const region = body['region'] ?? DEFAULT_REGION;
  if (typeof region !== 'string') errors.push({ path: 'region', rule: 'type', expected: 'string' });
  else if (!REGION.test(region)) errors.push({ path: 'region', rule: 'format', expected: 'an AWS region such as ap-south-1' });

  const timeZone = body['timeZone'] ?? TENANT_CONFIG_DEFAULTS.timeZone;
  if (typeof timeZone !== 'string') errors.push({ path: 'timeZone', rule: 'type', expected: 'string' });
  else if (!isIanaTimeZone(timeZone)) errors.push({ path: 'timeZone', rule: 'format', expected: 'an IANA time zone' });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name: (name as string).trim(), slug: slug as string, region: region as string, timeZone: timeZone as string },
  };
}

// ---- Saga ---------------------------------------------------------------------------------------------------------

export interface TenantProvisioningServiceOptions {
  readonly database: ProvisioningDatabase;
  readonly keys: KeyService;
  readonly registry: TenantRegistry;
  readonly dns: DnsService;
  readonly audit: AuditService;
  readonly deadlineMs?: number;
  readonly now?: () => Instant;
  readonly newTenantId?: () => TenantId;
}

export class TenantProvisioningService {
  private readonly deadlineMs: number;
  private readonly now: () => Instant;
  private readonly newTenantId: () => TenantId;

  constructor(private readonly options: TenantProvisioningServiceOptions) {
    this.deadlineMs = options.deadlineMs ?? PROVISIONING_DEADLINE_MS;
    this.now = options.now ?? ((): Instant => instant(Date.now()));
    this.newTenantId = options.newTenantId ?? ((): TenantId => toTenantId(randomUUID()));
  }

  async provision(operator: OperatorPrincipal | undefined, input: unknown): Promise<ProvisionedTenant> {
    if (operator === undefined || operator.kind !== 'platform_operator' || operator.operatorId.length === 0) {
      throw new OperatorAuthenticationError();
    }
    const result = validateProvisionRequest(input);
    if (!result.ok) throw new ConfigValidationError(result.errors);
    const request = result.value;
    const tenantId = this.newTenantId();

    const startedAt = Date.now();
    const remaining = (): number => Math.max(0, this.deadlineMs - (Date.now() - startedAt));

    const compensations: Array<() => Promise<void>> = [];
    let step: ProvisioningStep = 'keys';
    let cause: unknown;
    try {
      // Step 1: keys, outside the database transaction.
      const keys = await this.run(remaining(), () => this.options.keys.createTenantKeys(tenantId, request.region), (late) =>
        this.options.keys.scheduleKeyDeletion(late, request.region),
      );
      compensations.unshift(() => this.options.keys.scheduleKeyDeletion(keys, request.region));

      // Step 2: one transaction with the tenant row and every default.
      step = 'database';
      await this.run(remaining(), () => this.createDefaults(tenantId, request, keys), () => this.deprovision(tenantId));
      compensations.unshift(() => this.deprovision(tenantId));

      // Step 3: registry entry and DNS record.
      step = 'registry';
      await this.run(remaining(), () => this.register(tenantId, request), () => this.unregister(tenantId, request));
      compensations.unshift(() => this.unregister(tenantId, request));

      // Step 4: success audit entry. Failing to record it fails the run (18.9).
      step = 'audit';
      await this.run(remaining(), () => this.recordAudit(tenantId, operator, 'tenant.provisioned', 'success', undefined), () => Promise.resolve());

      return { tenantId, slug: request.slug, region: request.region, timeZone: request.timeZone };
    } catch (error) {
      cause = error;
    }

    const failedStep: ProvisioningStep = cause instanceof DeadlineError ? 'deadline' : step;
    let compensationFailures = 0;
    for (const compensate of compensations) {
      try {
        await compensate();
      } catch {
        compensationFailures += 1;
      }
    }
    let audited = true;
    try {
      await this.recordAudit(tenantId, operator, 'tenant.provisioning_failed', 'failure', failedStep);
    } catch {
      audited = false;
    }
    throw new ProvisioningFailedError(failedStep, tenantId, audited, compensationFailures, { cause });
  }

  /**
   * Runs one step against the remaining time. When the deadline wins, the step may still finish later; `onLate`
   * then undoes its result so nothing is left behind.
   */
  private run<T>(remainingMs: number, step: () => Promise<T>, onLate: (value: T) => Promise<void>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (remainingMs <= 0) {
        reject(new DeadlineError());
        return;
      }
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new DeadlineError());
      }, remainingMs);
      step().then(
        (value) => {
          clearTimeout(timer);
          if (timedOut) void onLate(value).catch(() => undefined);
          else resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          if (!timedOut) reject(error);
        },
      );
    });
  }

  private async createDefaults(tenantId: TenantId, request: ProvisionTenantRequest, keys: TenantKeys): Promise<void> {
    await this.options.database.transaction(tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO core.tenants (id, slug, name, region, time_zone, data_key_id, signing_key_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        [tenantId, request.slug, request.name, request.region, request.timeZone, keys.dataKeyId, keys.signingKeyId],
      );
      await tx.query('INSERT INTO core.tenant_config (tenant_id, time_zone, region) VALUES ($1::uuid, $2, $3)', [
        tenantId,
        request.timeZone,
        request.region,
      ]);
      for (const role of DEFAULT_ROLES) {
        await tx.query('INSERT INTO core.tenant_roles (tenant_id, role) VALUES ($1::uuid, $2)', [tenantId, role]);
      }
      for (const category of DEFAULT_CATEGORIES) {
        await tx.query('INSERT INTO core.categories (tenant_id, name, default_band) VALUES ($1::uuid, $2, $3)', [
          tenantId,
          category.name,
          category.band,
        ]);
      }
      for (const band of PRIORITY_BANDS) {
        const sla = DEFAULT_SLA_POLICIES[band];
        await tx.query(
          `INSERT INTO core.sla_policies (tenant_id, band, first_response_min, resolution_min, l1_min, l2_min)
           VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
          [tenantId, band, sla.firstResponseMin, sla.resolutionMin, sla.l1Min, sla.l2Min],
        );
      }
      await tx.query(
        'INSERT INTO core.working_calendars (tenant_id, time_zone, weekly) VALUES ($1::uuid, $2, $3::jsonb)',
        [tenantId, request.timeZone, JSON.stringify(DEFAULT_WEEKLY_HOURS)],
      );
    });
  }

  private async register(tenantId: TenantId, request: ProvisionTenantRequest): Promise<void> {
    await this.options.registry.register({ tenantId, slug: request.slug, region: request.region });
    try {
      await this.options.dns.createRecord(request.slug, request.region);
    } catch (error) {
      await this.options.registry.remove(tenantId).catch(() => undefined);
      throw error;
    }
  }

  private async unregister(tenantId: TenantId, request: ProvisionTenantRequest): Promise<void> {
    const results = await Promise.allSettled([
      this.options.dns.deleteRecord(request.slug, request.region),
      this.options.registry.remove(tenantId),
    ]);
    if (results.some((r) => r.status === 'rejected')) throw new Error('registry compensation failed');
  }

  /** Removes the Tenant's rows through the owner-run function, in its own transaction. */
  private async deprovision(tenantId: TenantId): Promise<void> {
    await this.options.database.transaction(tenantId, async (tx) => {
      await tx.query('SELECT app.deprovision_tenant($1::uuid)', [tenantId]);
    });
  }

  /** Audit entries are written in their own transaction, under the Tenant's id, so they survive a rollback. */
  private async recordAudit(
    tenantId: TenantId,
    operator: OperatorPrincipal,
    action: string,
    outcome: 'success' | 'failure',
    step: ProvisioningStep | undefined,
  ): Promise<void> {
    await this.options.database.transaction(tenantId, async (tx) => {
      await this.options.audit.record(tx, tenantId, {
        actor: 'system',
        role: auditCode('platform_operator'),
        action: auditCode(action),
        target: `tenant:${tenantId}`,
        outcome,
        details: {
          operator: auditRef(operator.operatorId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'unknown'),
          ...(step === undefined ? {} : { step: auditCode(step) }),
        },
        timestampMs: this.now(),
      });
    });
  }
}
