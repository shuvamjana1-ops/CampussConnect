/**
 * Per-tenant, per-purpose rate limiting for AI calls.
 *
 * Implements a sliding window counter (configurable) to limit the number of requests
 * to the AI adapter within a time window. Each tenant has independent limits.
 */
export interface RateLimitConfig {
  /** Maximum calls allowed within the window. */
  readonly maxCalls: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
}

interface CallRecord {
  readonly timestamp: number;
}

export class PerTenantRateLimiter {
  private readonly config: Map<string, RateLimitConfig>;
  private readonly callHistory = new Map<string, CallRecord[]>();

  constructor(configs: Record<string, RateLimitConfig> = {}) {
    this.config = new Map(Object.entries(configs));
  }

  /**
   * Set a rate limit config for a purpose. Default if not set: 1000 calls per 60 seconds.
   */
  setConfig(purpose: string, config: RateLimitConfig): void {
    this.config.set(purpose, config);
  }

  /**
   * Check if a call is allowed for the given tenant and purpose.
   * @returns { allowed: true } or { allowed: false, retryAfterMs: number }
   */
  checkLimit(tenantId: string, purpose: string, now: number): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const config = this.config.get(purpose) || { maxCalls: 1000, windowMs: 60000 };
    const key = `${tenantId}:${purpose}`;

    const history = this.callHistory.get(key) || [];
    const windowStart = now - config.windowMs;

    // Remove stale entries
    const recentCalls = history.filter((c) => c.timestamp > windowStart);

    if (recentCalls.length >= config.maxCalls) {
      // Find the oldest call to estimate when it leaves the window
      const oldestCall = recentCalls[0];
      const retryAfterMs = oldestCall.timestamp + config.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Record this call
    recentCalls.push({ timestamp: now });
    this.callHistory.set(key, recentCalls);

    return { allowed: true };
  }

  /**
   * Get current call count for a tenant and purpose within the window.
   */
  getCallCount(tenantId: string, purpose: string, now: number): number {
    const config = this.config.get(purpose) || { maxCalls: 1000, windowMs: 60000 };
    const key = `${tenantId}:${purpose}`;

    const history = this.callHistory.get(key) || [];
    const windowStart = now - config.windowMs;

    return history.filter((c) => c.timestamp > windowStart).length;
  }

  /**
   * Reset all limits. Used in testing or when flushing state.
   */
  reset(): void {
    this.callHistory.clear();
  }
}
