import { describe, it, expect } from 'vitest';
import { FakeAiAdapter, CircuitBreakerAdapter, PerTenantRateLimiter } from './index';
import { mintRedactedText } from '@campusconnect/pii-redactor';

describe('AI Adapter Integration', () => {
  it('should create adapter with circuit breaker and rate limiter', () => {
    const fake = new FakeAiAdapter();
    const breaker = new CircuitBreakerAdapter(fake);
    const limiter = new PerTenantRateLimiter({
      triage: { maxCalls: 100, windowMs: 60000 },
      embed: { maxCalls: 50, windowMs: 60000 },
    });

    expect(fake).toBeDefined();
    expect(breaker).toBeDefined();
    expect(limiter).toBeDefined();
  });

  it('should use full stack: rate limiter + circuit breaker + adapter', async () => {
    const fake = new FakeAiAdapter();
    const breaker = new CircuitBreakerAdapter(fake);
    const limiter = new PerTenantRateLimiter({
      triage: { maxCalls: 5, windowMs: 1000 },
    });

    const tenantId = 'tenant-1';
    const purpose = 'triage';
    const now = Date.now();

    // Check rate limit, then call adapter
    const limitCheck = limiter.checkLimit(tenantId, purpose, now);
    expect(limitCheck.allowed).toBe(true);

    const text = mintRedactedText('[PII:NAME] cannot access grades');
    const result = await breaker.scorePriority({ text }, { timeoutMs: 5000 });

    expect(result.type).toBe('success');
  });
});
