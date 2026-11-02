// Types for Student profiles (requirements 10.1 to 10.9).

import type { FieldError } from '@campusconnect/contracts';
import type { ErpStudent } from '@campusconnect/erp-adapter';

/** Minimal SQL surface the module needs. Compatible with the outbox, notification and privacy clients. */
export interface ProfileSqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** Runs `fn` in one transaction with the Tenant set for row-level security. */
export interface ProfileDatabase {
  transaction<T>(scope: { readonly tenantId: string }, fn: (tx: ProfileSqlClient) => Promise<T>): Promise<T>;
}

export interface ProfileActor {
  readonly tenantId: string;
  readonly userId: string;
}

/** First sign-in must prefill within 10 seconds (10.1, 10.2). */
export const PROFILE_PREFILL_TIMEOUT_MS = 10_000;
/** Purpose the Student consents to before an income band is stored (10.5). */
export const INCOME_BAND_PURPOSE = 'income_band_matching';

export type FieldSource = 'erp' | 'student';

export interface ProfileFieldValue {
  readonly value: unknown;
  readonly source: FieldSource;
  readonly updatedAt: number;
}

export type ProfileFields = Readonly<Record<string, ProfileFieldValue>>;

/** Fields the ERP supplies. They are authoritative and read-only for the Student (10.1, 10.4). */
export const ERP_FIELDS = [
  'rollNumber',
  'program',
  'year',
  'department',
  'hostel',
  'gender',
  'socialCategory',
] as const;

/** Fields the Student maintains. */
export const STUDENT_FIELDS = [
  'skills',
  'interests',
  'achievements',
  'preferredLocations',
  'cgpa',
  'graduationYear',
  'incomeBand',
] as const;

/** Matching-relevant fields counted by completeness unless the Tenant configures its own list (10.9). */
export const DEFAULT_MATCHING_FIELDS: readonly string[] = [
  'program',
  'department',
  'year',
  'skills',
  'interests',
  'achievements',
  'preferredLocations',
  'cgpa',
];

export type PrefillStatus = 'prefilled' | 'pending' | 'unavailable';

export interface ProfileView {
  readonly fields: ProfileFields;
  readonly prefillStatus: PrefillStatus;
  /** True while ERP data is unavailable so the UI shows the notice (10.2). */
  readonly erpUnavailableNotice: boolean;
  readonly embeddingStale: boolean;
}

export interface CompletenessView {
  readonly percent: number;
  readonly missing: readonly string[];
}

/** Notifies the Student that ERP data could not be fetched after every retry (10.2, ERP_PREFILL_POLICY). */
export interface PrefillFailureNotifier {
  prefillUnavailable(tx: ProfileSqlClient, tenantId: string, userId: string): Promise<void>;
}

export type ErpStudentRecord = ErpStudent;

/** An edit touched a field the ERP manages. Maps to `409 ERP_FIELD_READ_ONLY` (10.4). */
export class ErpFieldReadOnlyError extends Error {
  readonly code = 'ERP_FIELD_READ_ONLY' as const;
  constructor(readonly fieldNames: readonly string[]) {
    super('The field is managed by the ERP.');
    this.name = 'ErpFieldReadOnlyError';
  }
}

/** A profile edit is out of bounds. Maps to `422 VALIDATION_FAILED`. */
export class ProfileValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(readonly fields: readonly FieldError[]) {
    super('Profile values are invalid.');
    this.name = 'ProfileValidationError';
  }
}

export class ProfileNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor() {
    super('Profile not found.');
    this.name = 'ProfileNotFoundError';
  }
}
