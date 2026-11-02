import { describe, it, expect, beforeEach } from 'vitest';
import { PerTenantRateLimiter } from './rate-limiter';

describe('PerTenantRateLimiter', () => {
  let limiter: PerTenantRateLimiter;

  beforeEach(() => {
    limiter = new PerTenantRateLimiter({
      triage: { maxCalls: 10, windowMs: 1000 },
      embed: { maxCalls: 5, windowMs: 1000 },
    });
  });

  it('should allow calls within limit', () => {
    const result = limiter.checkLimit('tenant1', 'triage', Date.now());
    expect(result.allowed).toBe(true);
  });

  it('should reject calls exceeding limit', () => {
    const now = Date.now();
    const config = { maxCalls: 2, windowMs: 1000 };
    limiter.setConfig('test', config);

    // First two calls should succeed
    expect(limiter.checkLimit('tenant1', 'test', now).allowed).toBe(true);
    expect(limiter.checkLimit('tenant1', 'test', now).allowed).toBe(true);

    // Third call should fail
    const result = limiter.checkLimit('tenant1', 'test', now);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('should isolate rate limits per tenant', () => {
    const now = Date.now();
    const config = { maxCalls: 1, windowMs: 1000 };
    limiter.setConfig('test', config);

    // Tenant 1: first call succeeds
    expect(limiter.checkLimit('tenant1', 'test', now).allowed).toBe(true);
    // Tenant 1: second call fails
    expect(limiter.checkLimit('tenant1', 'test', now).allowed).toBe(false);

    // Tenant 2: first call still succeeds (different tenant)
    expect(limiter.checkLimit('tenant2', 'test', now).allowed).toBe(true);
    // Tenant 2: second call fails
    expect(limiter.checkLimit('tenant2', 'test', now).allowed).toBe(false);
  });

  it('should isolate rate limits per purpose', () => {
    const now = Date.now();

    // Triage: max 10 in 1s
    // Embed: max 5 in 1s

    // Fill up embed limit (5 calls)
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.checkLimit('tenant1', 'embed', now).allowed).toBe(true);
    }

    // 6th embed call should fail
    expect(limiter.checkLimit('tenant1', 'embed', now).allowed).toBe(false);

    // But triage should still work
    expect(limiter.checkLimit('tenant1', 'triage', now).allowed).toBe(true);
  });

  it('should reset window after duration', () => {
    const config = { maxCalls: 1, windowMs: 100 };
    limiter.setConfig('test', config);

    const start = Date.now();

    // First call succeeds
    expect(limiter.checkLimit('tenant1', 'test', start).allowed).toBe(true);

    // Second call fails (same window)
    expect(limiter.checkLimit('tenant1', 'test', start + 50).allowed).toBe(false);

    // After window expires, call succeeds again
    expect(limiter.checkLimit('tenant1', 'test', start + 150).allowed).toBe(true);
  });

  it('should return correct retry-after duration', () => {
    const config = { maxCalls: 1, windowMs: 1000 };
    limiter.setConfig('test', config);

    const start = Date.now();

    // Fill the limit
    limiter.checkLimit('tenant1', 'test', start);

    // Get rejected with retry-after
    const result = limiter.checkLimit('tenant1', 'test', start + 100);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      // Should be approximately 900ms (1000ms window - 100ms elapsed)
      expect(result.retryAfterMs).toBeGreaterThan(800);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
    }
  });

  it('should track call count', () => {
    const now = Date.now();

    limiter.checkLimit('tenant1', 'triage', now);
    limiter.checkLimit('tenant1', 'triage', now);
    limiter.checkLimit('tenant1', 'triage', now);

    const count = limiter.getCallCount('tenant1', 'triage', now);
    expect(count).toBe(3);
  });

  it('should reset state', () => {
    const now = Date.now();

    limiter.checkLimit('tenant1', 'triage', now);
    limiter.reset();

    const count = limiter.getCallCount('tenant1', 'triage', now);
    expect(count).toBe(0);
  });

  it('should use default config if purpose not configured', () => {
    const now = Date.now();

    // 'unknown' purpose has no config, should use defaults
    // Default is 1000 calls per 60 seconds

    let allowed = true;
    for (let i = 0; i < 100; i += 1) {
      const result = limiter.checkLimit('tenant1', 'unknown', now);
      if (!result.allowed) {
        allowed = false;
        break;
      }
    }

    // Should allow 100 calls (default is 1000)
    expect(allowed).toBe(true);
  });
});
