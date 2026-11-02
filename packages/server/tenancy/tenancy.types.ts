// Types for Tenant configuration (requirements 1.5, 1.6, 2.7, 5.5, 18.1, 22.7).

import type { FieldError } from '@campusconnect/contracts';
import type { TenantId, UserId } from '@campusconnect/domain/types';
import type { AuditSqlClient } from '../audit';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = (typeof WEEKDAYS)[number];

export interface ExecutiveDigestConfig {
  readonly weekday: Weekday;
  /** `HH:mm` in the Tenant time zone. */
  readonly time: string;
}

/** The per-Tenant settings stored in `core.tenant_config`. */
export interface TenantConfig {
  /** IANA time zone, default `Asia/Kolkata`. */
  readonly timeZone: string;
  /** AWS region, default `ap-south-1` (1.9). */
  readonly region: string;
  /** 0.00 to 1.00, default 0.70 (5.5). */
  readonly confidenceThreshold: number;
  /** 0.00 to 1.00, default 0.60 (3.11). */
  readonly duplicateThreshold: number;
  /** 0.00 to 1.00, default 0.70 (16.2). */
  readonly copilotConfidenceThreshold: number;
  /** 2 to 1000, default 5. The effective value is `max(5, kAnonymity)` (G1). */
  readonly kAnonymity: number;
  /** 3 to 20, default 5 (14.5). */
  readonly spikeClusterK: number;
  /** 5 to 480 minutes, default 30 (2.7). */
  readonly sessionIdleMinutes: number;
  readonly smsEnabled: boolean;
  readonly broadcastApprovalRequired: boolean;
  /** Default 50,000 (G2). Emergency alerts are exempt. */
  readonly broadcastRecipientCap: number;
  /** Default Monday 08:00 (14.2). */
  readonly executiveDigest: ExecutiveDigestConfig;
  readonly trainingLabelOptIn: boolean;
}

/** A partial update. Only the fields present are validated and changed. */
export type TenantConfigPatch = {
  readonly [K in keyof TenantConfig]?: TenantConfig[K];
};

export const TENANT_CONFIG_DEFAULTS: TenantConfig = Object.freeze({
  timeZone: 'Asia/Kolkata',
  region: 'ap-south-1',
  confidenceThreshold: 0.7,
  duplicateThreshold: 0.6,
  copilotConfidenceThreshold: 0.7,
  kAnonymity: 5,
  spikeClusterK: 5,
  sessionIdleMinutes: 30,
  smsEnabled: false,
  broadcastApprovalRequired: true,
  broadcastRecipientCap: 50_000,
  executiveDigest: Object.freeze({ weekday: 1 as const, time: '08:00' }),
  trainingLabelOptIn: false,
});

export const PRIORITY_BANDS = ['P0', 'P1', 'P2', 'P3'] as const;
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

export interface Department {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface DutyEntry {
  readonly userId: string;
  readonly onDuty: boolean;
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly defaultDepartmentId: string | undefined;
  readonly defaultBand: PriorityBand;
  readonly active: boolean;
}

export interface RoutingRule {
  readonly id: string;
  readonly categoryId: string;
  readonly keywords: readonly string[];
  readonly departmentId: string;
  readonly rank: number;
}

export interface RoutingRuleInput {
  readonly categoryId: string;
  readonly keywords: readonly string[];
  readonly departmentId: string;
}

/** A category-specific row overrides the band default (`categoryId` undefined). */
export interface SlaPolicy {
  readonly id: string;
  readonly band: PriorityBand;
  readonly categoryId: string | undefined;
  readonly firstResponseMin: number;
  readonly resolutionMin: number;
  readonly l1Min: number;
  readonly l2Min: number;
}

export type SlaPolicyInput = Omit<SlaPolicy, 'id'>;

export interface WorkingWindow {
  /** `HH:mm`. */
  readonly start: string;
  /** `HH:mm`, after `start`. */
  readonly end: string;
}

/** Working windows by ISO weekday. A missing or empty weekday is a non-working day. */
export type WeeklyHours = { readonly [D in Weekday]?: readonly WorkingWindow[] };

export interface WorkingCalendar {
  readonly timeZone: string;
  readonly weekly: WeeklyHours;
  /** ISO dates (`YYYY-MM-DD`). */
  readonly holidays: readonly string[];
  readonly version: number;
}

export type WorkingCalendarInput = Omit<WorkingCalendar, 'version'>;

export const RATE_LIMIT_SCOPES = ['user', 'tenant'] as const;
export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number];

export interface RateLimitConfig {
  readonly scope: RateLimitScope;
  readonly limit: number;
  readonly windowSec: number;
}

/** The acting Tenant_Admin, as resolved by the guards. */
export interface TenancyActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly roles: readonly string[];
}

/** Opens a transaction with the actor's Tenant set for row-level security (for example through `withTenant`). */
export interface TenancyDatabase {
  transaction<T>(actor: TenancyActor, fn: (tx: AuditSqlClient) => Promise<T>): Promise<T>;
}

/** Thrown when submitted values are out of bounds. Nothing has been saved. Maps to `422 VALIDATION_FAILED` (1.6). */
export class ConfigValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly fields: readonly FieldError[]) {
    super('Configuration values are invalid.');
    this.name = 'ConfigValidationError';
  }
}

/** Thrown when the actor is not a Tenant_Admin. Maps to `403 INSUFFICIENT_PERMISSION` (2.5). */
export class ConfigPermissionError extends Error {
  readonly code = 'INSUFFICIENT_PERMISSION' as const;

  constructor() {
    super('Only a Tenant_Admin can change Tenant configuration.');
    this.name = 'ConfigPermissionError';
  }
}

/** Thrown when a row does not exist in the Tenant. Maps to `403 ACCESS_DENIED`, the same response as another Tenant's row (1.3). */
export class ConfigNotFoundError extends Error {
  readonly code = 'ACCESS_DENIED' as const;

  constructor() {
    super('Resource not found.');
    this.name = 'ConfigNotFoundError';
  }
}
