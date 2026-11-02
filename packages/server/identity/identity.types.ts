// Types and ports for sign-in, MFA and sessions.

import type { Role } from '@campusconnect/domain/rbac';
import type { DepartmentId, TenantId, UserId } from '@campusconnect/domain/types';

/** Minimal SQL surface. Same shape as the audit module's client, so one adapter serves both. */
export interface IdentitySqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** Opens a transaction with `app.tenant_id` set, so row-level security applies. */
export interface IdentityDatabase {
  transaction<T>(tenantId: TenantId, fn: (tx: IdentitySqlClient) => Promise<T>): Promise<T>;
}

export interface TenantRef {
  readonly id: TenantId;
  readonly slug: string;
}

/** Structurally compatible with `SsoProvider` from `@campusconnect/sso-adapter`. */
export interface SsoPort {
  buildAuthorizationRequest(
    tenant: { id: string; slug: string },
    returnTo: string,
  ): Promise<{ redirectUrl: string; state: string; nonce: string }>;
  handleCallback(
    tenant: { id: string; slug: string },
    params: Record<string, string>,
    expected: { state: string; nonce: string },
  ): Promise<{ externalSubject: string; authMethods: string[] }>;
}

/** Structurally compatible with `ErpAdapter.getStudent` from `@campusconnect/erp-adapter`. */
export interface ErpStudentRecord {
  externalId: string;
  name: string;
  email: string;
  rollNumber: string;
  program: string;
  year: number;
  department: string;
  enrolmentStatus: 'active' | 'inactive';
  hostel?: string;
  gender?: string;
  socialCategory?: string;
}

export interface ErpPort {
  getStudent(tenantId: string, externalId: string, opts: { timeoutMs: number }): Promise<ErpStudentRecord | null>;
}

/** A signed-in user's state, held in Valkey. */
export interface Session {
  readonly id: string;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly roles: readonly Role[];
  readonly departmentIds: readonly DepartmentId[];
  readonly mfaVerified: boolean;
  /** UTC milliseconds of the last request that refreshed the session. */
  readonly lastActivityAt: number;
  /** Idle timeout in minutes at the time of the last refresh. */
  readonly idleMinutes: number;
}

/** Key-value store with expiry, backed by Valkey in production. */
export interface SessionStore {
  get(key: string): Promise<string | undefined>;
  /** Stores `value` under `key` and expires it after `ttlSeconds`. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Removes the key and returns its previous value, atomically. */
  take(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  /** Resets the expiry of an existing key. Returns false if the key is gone. */
  touch(key: string, ttlSeconds: number): Promise<boolean>;
}

/** Encrypts TOTP secrets under the platform KMS key. */
export interface SecretCipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/** Reads the Tenant's idle timeout setting (5 to 480 minutes, default 30). */
export interface IdleTimeoutProvider {
  idleMinutes(tenantId: TenantId): Promise<number>;
}

export interface TotpEngine {
  generateSecret(): string;
  /** Returns the matched time step, or `undefined` if the code does not match. */
  verify(secret: string, code: string, nowMs: number): number | undefined;
  keyUri(secret: string, accountName: string, issuer: string): string;
}

export type AuthEventAction =
  | 'auth.sign_in'
  | 'auth.sign_in_failed'
  | 'auth.account_locked'
  | 'auth.locked_attempt_rejected'
  | 'auth.mfa_enrolled'
  | 'auth.mfa_failed'
  | 'auth.sso_unavailable'
  | 'auth.account_not_in_records'
  | 'auth.no_role'
  | 'auth.sign_out'
  | 'auth.session_expired';

export interface AuthEvent {
  readonly tenantId: TenantId;
  readonly actor: UserId | 'system';
  readonly action: AuthEventAction;
  readonly outcome: 'success' | 'failure';
  /** Opaque reference, such as `user:<id>` or `account:<key hash>`. Never free text. */
  readonly target: string;
  readonly timestampMs: number;
}

/**
 * Records authentication events (18.1). The implementation wraps `AuditService.record` in the supplied
 * transaction, so the entry commits with the change it describes. Failures must throw.
 */
export interface AuthAuditSink {
  record(tx: IdentitySqlClient, event: AuthEvent): Promise<void>;
}

/** Why sign-in did not complete. `code` matches the error catalogue. */
export type IdentityErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'SSO_UNAVAILABLE'
  | 'ACCOUNT_NOT_IN_RECORDS'
  | 'MFA_FAILED'
  | 'INSUFFICIENT_PERMISSION'
  | 'AUDIT_UNAVAILABLE';

export class IdentityError extends Error {
  override readonly name = 'IdentityError';

  constructor(
    readonly code: IdentityErrorCode,
    /** For `ACCOUNT_LOCKED`: ISO 8601 time at which the lock ends. */
    readonly unlockAt?: string,
    options?: ErrorOptions,
  ) {
    super(`Identity error: ${code}`, options);
  }
}
