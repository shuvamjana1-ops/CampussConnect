import { randomUUID } from 'node:crypto';
import { AuditService, auditCode, auditRef } from '@campusconnect/server/audit';
import type { IdentityDatabase } from '@campusconnect/server/identity';
import type { Instant, TenantId } from '@campusconnect/domain/types';
import type {
  GuardAuditor,
  RateLimit,
  RateLimitConfigReader,
  RateLimitSettings,
  SlidingWindowCounter,
  TenantOwnership,
  WindowDecision,
} from './guard-ports';

/** Used when a Tenant has no `rate_limit_config` row for a scope. */
export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  user: { limit: 120, windowSec: 60 },
  tenant: { limit: 3000, windowSec: 60 },
};

/** Writes `auth.rejected` and `tenant.cross_access_denied`, each in its own transaction (18.1, 1.4). */
export class SqlGuardAuditor implements GuardAuditor {
  constructor(
    private readonly db: IdentityDatabase,
    private readonly audit: AuditService,
  ) {}

  async authRejected(input: { tenantId?: TenantId; reason: string; timestampMs: number }): Promise<void> {
    // Without a Tenant there is no tenant-scoped audit chain to write to.
    if (input.tenantId === undefined) return;
    const tenantId = input.tenantId;
    await this.db.transaction(tenantId, (tx) =>
      this.audit.record(tx, tenantId, {
        actor: 'system',
        action: auditCode('auth.rejected'),
        target: 'session:none',
        outcome: 'failure',
        details: { reason: auditCode(input.reason) },
        timestampMs: input.timestampMs as Instant,
      }),
    );
  }

  async crossTenantDenied(input: {
    requestingTenantId: TenantId;
    targetTenantId: TenantId;
    userId: import('@campusconnect/domain/types').UserId;
    resourceType: string;
    timestampMs: number;
  }): Promise<void> {
    await this.db.transaction(input.requestingTenantId, (tx) =>
      this.audit.record(tx, input.requestingTenantId, {
        actor: input.userId,
        action: auditCode('tenant.cross_access_denied'),
        target: `tenant:${input.targetTenantId}`,
        outcome: 'failure',
        details: {
          requestingTenant: auditRef(input.requestingTenantId),
          targetTenant: auditRef(input.targetTenantId),
          resourceType: auditCode(input.resourceType),
        },
        timestampMs: input.timestampMs as Instant,
      }),
    );
  }
}

/** `app.owner_tenant_of` is SECURITY DEFINER, so it answers across Tenants without exposing rows. */
export class SqlTenantOwnership implements TenantOwnership {
  constructor(private readonly db: IdentityDatabase) {}

  async ownerTenantOf(requestingTenantId: TenantId, resourceType: string, resourceId: string): Promise<string | undefined> {
    return this.db.transaction(requestingTenantId, async (tx) => {
      const result = await tx.query<{ tenant_id: string | null }>(
        'SELECT app.owner_tenant_of($1, $2::uuid)::text AS tenant_id',
        [resourceType, resourceId],
      );
      return result.rows[0]?.tenant_id ?? undefined;
    });
  }
}

const CONFIG_CACHE_MS = 15_000;

/** Reads `core.rate_limit_config`, cached briefly so a change applies without a deployment (22.7). */
export class SqlRateLimitConfig implements RateLimitConfigReader {
  private readonly cache = new Map<string, { readonly at: number; readonly value: RateLimitSettings }>();

  constructor(
    private readonly db: IdentityDatabase,
    private readonly defaults: RateLimitSettings = DEFAULT_RATE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  async settings(tenantId: TenantId): Promise<RateLimitSettings> {
    const cached = this.cache.get(tenantId);
    const now = this.now();
    if (cached !== undefined && now - cached.at < CONFIG_CACHE_MS) return cached.value;
    const rows = await this.db.transaction(tenantId, async (tx) =>
      (
        await tx.query<{ scope: 'user' | 'tenant'; limit: number; window_sec: number }>(
          'SELECT scope, request_limit AS "limit", window_sec FROM core.rate_limit_config',
        )
      ).rows,
    );
    const pick = (scope: 'user' | 'tenant'): RateLimit => {
      const row = rows.find((r) => r.scope === scope);
      return row === undefined ? this.defaults[scope] : { limit: row.limit, windowSec: row.window_sec };
    };
    const value: RateLimitSettings = { user: pick('user'), tenant: pick('tenant') };
    this.cache.set(tenantId, { at: now, value });
    return value;
  }
}

/** The subset of an ioredis-style client used for rate limiting. */
export interface ValkeyEvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Atomic: trim old calls, reject when full (returning ms until the oldest leaves), otherwise count this call.
const SLIDING_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2]) * 1000
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {1, 0}
`;

/** Sliding-window counters in Valkey sorted sets. */
export class ValkeySlidingWindow implements SlidingWindowCounter {
  constructor(
    private readonly client: ValkeyEvalClient,
    private readonly prefix = 'cc:',
  ) {}

  async hit(key: string, limit: RateLimit, nowMs: number): Promise<WindowDecision> {
    const reply = await this.client.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      this.prefix + key,
      nowMs,
      limit.windowSec,
      limit.limit,
      `${nowMs}:${randomUUID()}`,
    );
    const [allowed, waitMs] = reply as [number, number];
    return allowed === 1 ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }
}
