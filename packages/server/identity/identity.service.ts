// Sign-in, MFA and session lifecycle (requirements 2.1 to 2.3, 2.7, 2.9, 2.10, 17.3, 17.4, 18.1).

import { createHash, randomBytes } from 'node:crypto';
import { lockoutState, sessionValid, STANDARD_LOCKOUT_POLICY } from '@campusconnect/domain/auth';
import type { Role } from '@campusconnect/domain/rbac';
import type { TenantId, UserId, Instant } from '@campusconnect/domain/types';
import { IdentityRepository, type UserRecord } from './identity.repository';
import {
  IdentityError,
  type AuthAuditSink,
  type AuthEventAction,
  type ErpPort,
  type IdentityDatabase,
  type IdentitySqlClient,
  type IdleTimeoutProvider,
  type SecretCipher,
  type Session,
  type SessionStore,
  type SsoPort,
  type TenantRef,
  type TotpEngine,
} from './identity.types';

export const SSO_STATE_TTL_SECONDS = 10 * 60;
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
/** First sign-in must create the Student record within 5 seconds (17.3). */
export const ERP_PREFILL_TIMEOUT_MS = 5_000;

const STAFF_ROLES: ReadonlySet<Role> = new Set<Role>(['handler', 'dept_head', 'executive', 'ombudsperson', 'tenant_admin']);

/** True when the roles include any role that needs a multi-factor challenge (2.3). */
export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.has(role));
}

export interface MfaEnrollment {
  /** `otpauth://` URI to show as a QR code. */
  readonly otpauthUri: string;
  /** Base32 secret for manual entry. */
  readonly secret: string;
}

export type SignInResult =
  | { readonly kind: 'session'; readonly session: Session; readonly firstSignIn: boolean }
  | {
      readonly kind: 'mfa_required';
      readonly challengeId: string;
      /** Present only when the user has no confirmed factor yet. */
      readonly enrollment?: MfaEnrollment;
    };

export interface IdentityServiceDeps {
  readonly db: IdentityDatabase;
  readonly sso: SsoPort;
  readonly erp: ErpPort;
  readonly sessions: SessionStore;
  readonly cipher: SecretCipher;
  readonly totp: TotpEngine;
  readonly audit: AuthAuditSink;
  readonly idleTimeouts: IdleTimeoutProvider;
  readonly issuer?: string;
  readonly now?: () => number;
}

interface PendingLogin {
  readonly tenantId: string;
  readonly nonce: string;
}

interface PendingMfa {
  readonly tenantId: string;
  readonly userId: string;
  readonly firstSignIn: boolean;
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function normalizeKey(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().slice(0, 256);
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export class IdentityService {
  private readonly repo = new IdentityRepository();
  private readonly now: () => number;
  private readonly issuer: string;

  constructor(private readonly deps: IdentityServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.issuer = deps.issuer ?? 'CampusConnect';
  }

  /** `GET /auth/login`: starts SSO and stores state and nonce server-side (2.1). Returns the URL to redirect to. */
  async startLogin(tenant: TenantRef, callbackUrl: string): Promise<string> {
    const request = await this.deps.sso.buildAuthorizationRequest(tenant, callbackUrl);
    const pending: PendingLogin = { tenantId: tenant.id, nonce: request.nonce };
    await this.deps.sessions.set(`login:${request.state}`, JSON.stringify(pending), SSO_STATE_TTL_SECONDS);
    return request.redirectUrl;
  }

  /**
   * `GET /auth/callback`: checks state and nonce, lockout, resolves the user, then either creates a session or asks
   * for a TOTP code. No session exists on any failure.
   */
  async handleCallback(tenant: TenantRef, params: Record<string, string>): Promise<SignInResult> {
    const state = params['state'];
    const stored = state === undefined ? undefined : await this.deps.sessions.take(`login:${state}`);
    if (state === undefined || stored === undefined) throw new IdentityError('AUTHENTICATION_REQUIRED');
    const pending = JSON.parse(stored) as PendingLogin;
    if (pending.tenantId !== tenant.id) throw new IdentityError('AUTHENTICATION_REQUIRED');

    let subject: string;
    try {
      const identity = await this.deps.sso.handleCallback(tenant, params, { state, nonce: pending.nonce });
      subject = identity.externalSubject;
    } catch (error) {
      throw await this.mapSsoError(tenant.id, error);
    }

    const accountKey = normalizeKey(subject);
    await this.assertNotLocked(tenant.id, accountKey);

    // Fetch ERP data before opening the write transaction so a slow ERP never holds a database transaction.
    let user = await this.deps.db.transaction(tenant.id, (tx) => this.repo.findUserBySubject(tx, tenant.id, subject));
    let firstSignIn = false;
    if (user === undefined) {
      user = await this.createStudentFromErp(tenant.id, subject);
      firstSignIn = true;
    }

    if (user.roles.length === 0) {
      await this.auditSeparately(tenant.id, user.id, 'auth.no_role', 'failure');
      throw new IdentityError('INSUFFICIENT_PERMISSION');
    }

    if (requiresMfa(user.roles)) return this.beginMfa(tenant, user, firstSignIn);

    await this.deps.db.transaction(tenant.id, async (tx) => {
      await this.repo.recordAttempt(tx, tenant.id, accountKey, this.now(), true);
    });
    const session = await this.createSession(tenant.id, user, false, 'auth.sign_in');
    return { kind: 'session', session, firstSignIn };
  }

  /** Completes a staff sign-in with a TOTP code. A wrong code counts as a failed attempt (2.9). */
  async verifyMfa(tenant: TenantRef, challengeId: string, code: string): Promise<Session> {
    const raw = await this.deps.sessions.get(`mfa:${challengeId}`);
    if (raw === undefined) throw new IdentityError('AUTHENTICATION_REQUIRED');
    const challenge = JSON.parse(raw) as PendingMfa;
    if (challenge.tenantId !== tenant.id) throw new IdentityError('AUTHENTICATION_REQUIRED');
    const userId = challenge.userId as UserId;
    const accountKey = `user:${userId}`;
    await this.assertNotLocked(tenant.id, accountKey);

    const user = await this.deps.db.transaction(tenant.id, (tx) => this.repo.findUserById(tx, tenant.id, userId));
    const factor = await this.deps.db.transaction(tenant.id, (tx) => this.repo.getMfaFactor(tx, tenant.id, userId));
    if (user === undefined || factor === undefined) throw new IdentityError('AUTHENTICATION_REQUIRED');

    const secret = await this.deps.cipher.decrypt(factor.secretCiphertext);
    const step = this.deps.totp.verify(secret, code, this.now());
    const accepted =
      step !== undefined &&
      (await this.deps.db.transaction(tenant.id, (tx) => this.repo.markFactorUsed(tx, tenant.id, userId, step)));

    if (!accepted) {
      const lock = await this.recordFailure(tenant.id, accountKey, userId, 'auth.mfa_failed');
      if (lock !== undefined) {
        await this.deps.sessions.delete(`mfa:${challengeId}`);
        throw lock;
      }
      throw new IdentityError('MFA_FAILED');
    }

    await this.deps.sessions.delete(`mfa:${challengeId}`);
    await this.deps.db.transaction(tenant.id, async (tx) => {
      await this.repo.recordAttempt(tx, tenant.id, accountKey, this.now(), true);
      if (!factor.confirmed) {
        await this.deps.audit.record(tx, {
          tenantId: tenant.id,
          actor: userId,
          action: 'auth.mfa_enrolled',
          outcome: 'success',
          target: `user:${userId}`,
          timestampMs: this.now(),
        });
      }
    });
    return this.createSession(tenant.id, user, true, 'auth.sign_in');
  }

  /**
   * Loads the session for a cookie value and refreshes its idle timer (2.7). Returns `undefined` when the session is
   * missing or idle for longer than the Tenant's timeout, and deletes an expired one.
   */
  async getSession(sessionId: string): Promise<Session | undefined> {
    const raw = await this.deps.sessions.get(`session:${sessionId}`);
    if (raw === undefined) return undefined;
    const session = JSON.parse(raw) as Session;
    const now = this.now();
    if (!sessionValid(session.lastActivityAt as Instant, now as Instant, session.idleMinutes)) {
      await this.deps.sessions.delete(`session:${sessionId}`);
      return undefined;
    }
    const idleMinutes = await this.deps.idleTimeouts.idleMinutes(session.tenantId);
    const refreshed: Session = { ...session, lastActivityAt: now, idleMinutes };
    await this.deps.sessions.set(`session:${sessionId}`, JSON.stringify(refreshed), idleMinutes * 60);
    return refreshed;
  }

  async signOut(sessionId: string): Promise<void> {
    const raw = await this.deps.sessions.take(`session:${sessionId}`);
    if (raw === undefined) return;
    const session = JSON.parse(raw) as Session;
    await this.auditSeparately(session.tenantId, session.userId, 'auth.sign_out', 'success');
  }

  private async beginMfa(tenant: TenantRef, user: UserRecord, firstSignIn: boolean): Promise<SignInResult> {
    const factor = await this.deps.db.transaction(tenant.id, (tx) => this.repo.getMfaFactor(tx, tenant.id, user.id));
    let enrollment: MfaEnrollment | undefined;
    if (factor === undefined || !factor.confirmed) {
      const secret = this.deps.totp.generateSecret();
      const ciphertext = await this.deps.cipher.encrypt(secret);
      await this.deps.db.transaction(tenant.id, (tx) => this.repo.saveUnconfirmedFactor(tx, tenant.id, user.id, ciphertext));
      enrollment = { secret, otpauthUri: this.deps.totp.keyUri(secret, user.email, this.issuer) };
    }
    const challengeId = newToken();
    const pending: PendingMfa = { tenantId: tenant.id, userId: user.id, firstSignIn };
    await this.deps.sessions.set(`mfa:${challengeId}`, JSON.stringify(pending), MFA_CHALLENGE_TTL_SECONDS);
    return enrollment === undefined ? { kind: 'mfa_required', challengeId } : { kind: 'mfa_required', challengeId, enrollment };
  }

  private async createSession(
    tenantId: TenantId,
    user: UserRecord,
    mfaVerified: boolean,
    action: AuthEventAction,
  ): Promise<Session> {
    const idleMinutes = await this.deps.idleTimeouts.idleMinutes(tenantId);
    const session: Session = {
      id: newToken(),
      userId: user.id,
      tenantId,
      roles: user.roles,
      departmentIds: user.departmentIds,
      mfaVerified,
      lastActivityAt: this.now(),
      idleMinutes,
    };
    // Audit first: if the entry cannot be written, no session exists (18.9).
    await this.deps.db.transaction(tenantId, (tx) =>
      this.deps.audit.record(tx, {
        tenantId,
        actor: user.id,
        action,
        outcome: 'success',
        target: `user:${user.id}`,
        timestampMs: this.now(),
      }),
    );
    await this.deps.sessions.set(`session:${session.id}`, JSON.stringify(session), idleMinutes * 60);
    return session;
  }

  /** Creates the Student from ERP data inside one transaction, or fails leaving nothing behind (17.3, 17.4). */
  private async createStudentFromErp(tenantId: TenantId, subject: string): Promise<UserRecord> {
    let record;
    try {
      record = await withDeadline(
        this.deps.erp.getStudent(tenantId, subject, { timeoutMs: ERP_PREFILL_TIMEOUT_MS }),
        ERP_PREFILL_TIMEOUT_MS,
      );
    } catch {
      // The ERP could not answer in time: deny sign-in without creating a record.
      await this.auditSeparately(tenantId, 'system', 'auth.account_not_in_records', 'failure');
      throw new IdentityError('SSO_UNAVAILABLE');
    }
    if (record === null) {
      await this.auditSeparately(tenantId, 'system', 'auth.account_not_in_records', 'failure');
      throw new IdentityError('ACCOUNT_NOT_IN_RECORDS');
    }
    const erpRecord = record;
    return this.deps.db.transaction(tenantId, (tx) => this.repo.createStudent(tx, tenantId, subject, erpRecord, this.now()));
  }

  private async assertNotLocked(tenantId: TenantId, accountKey: string): Promise<void> {
    const now = this.now();
    const attempts = await this.deps.db.transaction(tenantId, (tx) =>
      this.repo.failedAttempts(tx, tenantId, accountKey, now - STANDARD_LOCKOUT_POLICY.windowSeconds * 2000),
    );
    const state = lockoutState(
      attempts.map((failedAt) => ({ failedAt: failedAt as Instant })),
      now as Instant,
      STANDARD_LOCKOUT_POLICY,
    );
    if (!state.isLocked) return;
    // Attempts during a lock are rejected and not counted (2.9).
    await this.auditSeparately(tenantId, 'system', 'auth.locked_attempt_rejected', 'failure', refFor(accountKey));
    throw new IdentityError('ACCOUNT_LOCKED', new Date(now + state.lockedUntilSeconds * 1000).toISOString());
  }

  /** Records a failed attempt. Returns an `ACCOUNT_LOCKED` error if this failure locked the account. */
  private async recordFailure(
    tenantId: TenantId,
    accountKey: string,
    actor: UserId | 'system',
    action: AuthEventAction,
  ): Promise<IdentityError | undefined> {
    const now = this.now();
    const target = refFor(accountKey);
    return this.deps.db.transaction(tenantId, async (tx) => {
      await this.repo.recordAttempt(tx, tenantId, accountKey, now, false);
      await this.record(tx, tenantId, actor, action, 'failure', target);
      const attempts = await this.repo.failedAttempts(
        tx,
        tenantId,
        accountKey,
        now - STANDARD_LOCKOUT_POLICY.windowSeconds * 2000,
      );
      const state = lockoutState(
        attempts.map((failedAt) => ({ failedAt: failedAt as Instant })),
        now as Instant,
        STANDARD_LOCKOUT_POLICY,
      );
      if (!state.isLocked) return undefined;
      await this.record(tx, tenantId, actor, 'auth.account_locked', 'failure', target);
      return new IdentityError('ACCOUNT_LOCKED', new Date(now + state.lockedUntilSeconds * 1000).toISOString());
    });
  }

  private async mapSsoError(tenantId: TenantId, error: unknown): Promise<IdentityError> {
    switch (errorCodeOf(error)) {
      case 'SSO_UNAVAILABLE':
        await this.auditSeparately(tenantId, 'system', 'auth.sso_unavailable', 'failure');
        return new IdentityError('SSO_UNAVAILABLE', undefined, { cause: error });
      case 'SSO_AUTHENTICATION_FAILED': {
        const hint = (error as { accountHint?: unknown }).accountHint;
        if (typeof hint === 'string' && hint.length > 0) {
          const key = normalizeKey(hint);
          // A locked account rejects the attempt without counting it.
          try {
            await this.assertNotLocked(tenantId, key);
          } catch (locked) {
            return locked as IdentityError;
          }
          const lock = await this.recordFailure(tenantId, key, 'system', 'auth.sign_in_failed');
          if (lock !== undefined) return lock;
        }
        return new IdentityError('AUTHENTICATION_REQUIRED', undefined, { cause: error });
      }
      default:
        return new IdentityError('AUTHENTICATION_REQUIRED', undefined, { cause: error });
    }
  }

  private async record(
    tx: IdentitySqlClient,
    tenantId: TenantId,
    actor: UserId | 'system',
    action: AuthEventAction,
    outcome: 'success' | 'failure',
    target?: string,
  ): Promise<void> {
    await this.deps.audit.record(tx, {
      tenantId,
      actor,
      action,
      outcome,
      target: target ?? (actor === 'system' ? 'tenant' : `user:${actor}`),
      timestampMs: this.now(),
    });
  }

  /** Writes an audit entry in its own transaction, for failures where the main flow ends in an error. */
  private async auditSeparately(
    tenantId: TenantId,
    actor: UserId | 'system',
    action: AuthEventAction,
    outcome: 'success' | 'failure',
    target?: string,
  ): Promise<void> {
    await this.deps.db.transaction(tenantId, (tx) => this.record(tx, tenantId, actor, action, outcome, target));
  }
}

/** A short opaque reference for an account key, safe to store in audit entries. */
function refFor(accountKey: string): string {
  return `account:${createHash('sha256').update(accountKey).digest('hex').slice(0, 16)}`;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Deadline exceeded.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
