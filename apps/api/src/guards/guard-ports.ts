import type { Principal } from '@campusconnect/domain/rbac';
import type { TenantId, UserId } from '@campusconnect/domain/types';
import type { Session, TenantRef } from '@campusconnect/server/identity';

/** The parts of the HTTP request the guards read. Keeps the guards independent of the HTTP platform. */
export interface GuardRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly hostname?: string;
  readonly params?: Readonly<Record<string, string | undefined>>;
}

/** The parts of the HTTP response the guards write. */
export interface GuardResponse {
  setHeader(name: string, value: string): unknown;
}

/** Loads and refreshes a session from the cookie value. `IdentityService` satisfies this. */
export interface SessionReader {
  getSession(sessionId: string): Promise<Session | undefined>;
}

/** Maps the request host to a Tenant. Used only to cross-check the session, never to choose the Tenant (1.2). */
export interface HostTenantResolver {
  resolve(host: string): Promise<TenantRef | undefined>;
}

/** Adds the data a session does not carry (grants, enrolment status) to build the RBAC principal. */
export interface PrincipalDirectory {
  load(session: Session): Promise<Principal>;
}

/** Writes guard audit entries, each in its own transaction (18.1). */
export interface GuardAuditor {
  /** `auth.rejected`. `tenantId` is absent when the Tenant could not be resolved; implementations then record nothing durable. */
  authRejected(input: { tenantId?: TenantId; reason: AuthRejectionReason; timestampMs: number }): Promise<void>;
  /** `tenant.cross_access_denied` with requesting Tenant, targeted Tenant, user and timestamp (1.4). */
  crossTenantDenied(input: {
    requestingTenantId: TenantId;
    targetTenantId: TenantId;
    userId: UserId;
    resourceType: string;
    timestampMs: number;
  }): Promise<void>;
}

export type AuthRejectionReason = 'no_session' | 'session_invalid' | 'tenant_unresolved' | 'tenant_mismatch';

export interface RateLimit {
  readonly limit: number;
  readonly windowSec: number;
}

/** Per-scope limits from `rate_limit_config`. */
export interface RateLimitSettings {
  readonly user: RateLimit;
  readonly tenant: RateLimit;
}

export interface RateLimitConfigReader {
  settings(tenantId: TenantId): Promise<RateLimitSettings>;
}

export interface WindowDecision {
  readonly allowed: boolean;
  /** Seconds until the oldest counted call leaves the window. Zero when allowed. */
  readonly retryAfterSeconds: number;
}

/** Sliding-window counter. Counts the call when it is allowed. */
export interface SlidingWindowCounter {
  hit(key: string, limit: RateLimit, nowMs: number): Promise<WindowDecision>;
}

/** Wraps `app.owner_tenant_of`: the owning Tenant, or `undefined` when the resource does not exist. */
export interface TenantOwnership {
  ownerTenantOf(requestingTenantId: TenantId, resourceType: string, resourceId: string): Promise<string | undefined>;
}
