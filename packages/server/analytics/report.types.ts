// Ports, errors and constants for scheduled reports (requirements 15.1, 15.2, 15.3, 15.6, 15.8).

import type { FieldError, ReportFormat, ReportFrequency } from '@campusconnect/contracts';
import type { Principal } from '@campusconnect/domain/rbac';

/** The sweeper enqueues due schedules every minute (design, Reports and board pack). */
export const REPORT_SWEEP_CADENCE_MS = 60 * 1000;
/** A failed first attempt is retried 10 minutes later, inside the 15-minute limit (15.6). */
export const REPORT_RETRY_DELAY_MS = 10 * 60 * 1000;
/** Download links expire after 7 days. */
export const REPORT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Default k for released aggregates; the gateway applies at least 5. */
export const REPORT_DEFAULT_K = 5;
/** A run still `running` after this long is treated as abandoned and failed. */
export const REPORT_RUN_STALE_MS = 15 * 60 * 1000;

/** Frequencies the `report_schedules` table stores. */
export const STORED_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type StoredFrequency = (typeof STORED_FREQUENCIES)[number];

/** The user an endpoint acts for, resolved by the guards. */
export interface ReportActor {
  readonly principal: Principal;
}

export interface ReportScheduleRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly frequency: StoredFrequency;
  readonly format: ReportFormat;
  readonly recipients: readonly string[];
  /** UTC milliseconds. */
  readonly nextRunAt: number;
}

/** Object storage for rendered reports. An S3 adapter implements it in the worker app. */
export interface ReportObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** A link that stops working after `expiresInSeconds`. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** Sends report notifications through the Notification_Service. */
export interface ReportNotifier {
  reportReady(input: { tenantId: string; scheduleId: string; recipientIds: readonly string[]; url: string }): Promise<void>;
  /** Tells the owner the report failed twice; the schedule is kept (15.6). */
  generationFailed(input: { tenantId: string; scheduleId: string; ownerId: string }): Promise<void>;
}

/** Looks up identities the report service does not store. */
export interface ReportDirectory {
  /** The subset of `userIds` that are users of the Tenant (15.2). */
  tenantUsers(tenantId: string, userIds: readonly string[]): Promise<ReadonlySet<string>>;
  /** The owner's current roles and departments, or undefined when the user is gone or inactive. */
  principalOf(tenantId: string, userId: string): Promise<Principal | undefined>;
  timeZoneOf(tenantId: string): Promise<string>;
  /** The k-anonymity setting of the Tenant. */
  kAnonymityOf(tenantId: string): Promise<number>;
}

/** One row of report content: aggregate counts only, no identities. */
export interface ReportRow {
  readonly department: string;
  readonly band: string;
  readonly created: number | 'Insufficient data';
  readonly resolved: number | 'Insufficient data';
  readonly escalated: number | 'Insufficient data';
  readonly breached: number | 'Insufficient data';
}

export interface ReportContent {
  readonly title: string;
  readonly frequency: ReportFrequency;
  /** `YYYY-MM-DD`, inclusive. */
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly rows: readonly ReportRow[];
}

export interface RenderedReport {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly extension: 'csv' | 'pdf';
}

export interface ReportRenderer {
  render(format: ReportFormat, content: ReportContent): Promise<RenderedReport>;
}

/** Maps to `422 VALIDATION_FAILED`. */
export class ReportValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly fields: readonly FieldError[]) {
    super('Report schedule values are invalid.');
    this.name = 'ReportValidationError';
  }
}

/** Maps to `403 INSUFFICIENT_PERMISSION`. Only Dept_Heads and Executives manage report schedules. */
export class ReportPermissionError extends Error {
  readonly code = 'INSUFFICIENT_PERMISSION' as const;

  constructor() {
    super('The role does not allow report schedules.');
    this.name = 'ReportPermissionError';
  }
}

/** Maps to `403 ACCESS_DENIED`, so the existence of other owners' schedules is not revealed. */
export class ReportScheduleNotFoundError extends Error {
  readonly code = 'ACCESS_DENIED' as const;

  constructor() {
    super('Report schedule not found.');
    this.name = 'ReportScheduleNotFoundError';
  }
}
