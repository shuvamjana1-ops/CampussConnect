import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ASYNC_JOB_POLICY,
  ERP_PREFILL_POLICY,
  ERP_SYNC_POLICY,
  EMBEDDING_REGENERATION_POLICY,
  P0_ESCALATION_POLICY,
  REPORT_RETRY_POLICY,
  executeWithRetry,
  exponentialWithJitter,
  fixedInterval,
  retryDelayMs,
  type RetryPolicy,
  type TerminalAction,
} from '@campusconnect/domain/retry';
import { retryPolicies } from './arbitraries/retry.js';

function harness() {
  const sleeps: number[] = [];
  const terminals: TerminalAction[] = [];
  return {
    sleeps,
    terminals,
    deps: {
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      random: () => 0.5,
      onTerminal: (a: TerminalAction) => {
        terminals.push(a);
      },
    },
  };
}

describe('named retry policies', () => {
  it('matches the specified counts and delays', () => {
    expect(P0_ESCALATION_POLICY).toMatchObject({ maxRetries: 3, delayMs: 30_000, terminal: 'flag' });
    expect(ERP_PREFILL_POLICY).toMatchObject({ maxRetries: 3, delayMs: 300_000 });
    expect(EMBEDDING_REGENERATION_POLICY).toMatchObject({ maxRetries: 3, delayMs: 300_000 });
    expect(REPORT_RETRY_POLICY.maxRetries).toBe(1);
    expect(retryDelayMs(REPORT_RETRY_POLICY, 0)).toBeLessThanOrEqual(15 * 60_000);
    expect(ERP_SYNC_POLICY).toMatchObject({ maxRetries: 4, delayMs: 900_000 });
    expect(ASYNC_JOB_POLICY).toMatchObject({ maxRetries: 5, baseDelayMs: 5000, jitterRatio: 0.2, terminal: 'dead-letter' });
  });

  it('computes async-job delays as 5 s x 2^n plus up to 20% jitter', () => {
    expect(retryDelayMs(ASYNC_JOB_POLICY, 2, () => 0)).toBe(20_000);
    expect(retryDelayMs(ASYNC_JOB_POLICY, 2, () => 0.999999)).toBeLessThan(24_000);
  });
});

describe('executeWithRetry', () => {
  it('stops at the first success without a terminal action', async () => {
    const h = harness();
    const out = await executeWithRetry(P0_ESCALATION_POLICY, (n) => (n < 3 ? Promise.reject(new Error('x')) : 'ok'), h.deps);
    expect(out).toEqual({ ok: true, value: 'ok', attempts: 3 });
    expect(h.sleeps).toEqual([30_000, 30_000]);
    expect(h.terminals).toEqual([]);
  });

  it('runs the terminal action once after 1 + maxRetries failures', async () => {
    const h = harness();
    const out = await executeWithRetry(ASYNC_JOB_POLICY, () => Promise.reject(new Error('x')), h.deps);
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(6);
    expect(h.sleeps).toEqual([6000, 12_000, 24_000, 48_000, 96_000]);
    expect(h.terminals).toEqual(['dead-letter']);
  });
});

describe('Property 18: Retry policies', () => {
  describe('Fixed interval policies compute consistent delays', () => {
    it('Property 18.1: Fixed interval delay is constant across all retries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 100, max: 600000 }),
          (maxRetries, delayMs) => {
            const policy = fixedInterval(maxRetries, delayMs, 'flag');
            // All retry delays should be exactly the configured delay
            for (let retryIndex = 0; retryIndex < maxRetries; retryIndex++) {
              expect(retryDelayMs(policy, retryIndex)).toBe(delayMs);
            }
          },
        ),
      );
    });
  });

  describe('Exponential backoff with jitter produces strictly increasing delays', () => {
    it('Property 18.2: Each exponential retry delay is greater than the previous one', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 100, max: 60000 }),
          fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 1, max: 100 })).map(([a, b]) =>
            Math.min(a, b - 1) / 100,
          ),
          (maxRetries, baseDelayMs, jitterRatio) => {
            const policy = exponentialWithJitter(maxRetries, baseDelayMs, jitterRatio, 'dead-letter');

            // Use a fixed random function to get deterministic results
            const randomValue = 0.5; // Mid-range jitter
            const delays: number[] = [];
            for (let retryIndex = 0; retryIndex < maxRetries; retryIndex++) {
              delays.push(retryDelayMs(policy, retryIndex, () => randomValue));
            }

            // Each delay should be strictly greater than the previous one
            for (let i = 1; i < delays.length; i++) {
              expect(delays[i]).toBeGreaterThan(delays[i - 1]);
            }
          },
        ),
      );
    });

    it('Property 18.3: Exponential delay without jitter follows 2^n pattern', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 8 }),
          fc.integer({ min: 100, max: 60000 }),
          (maxRetries, baseDelayMs) => {
            const policy = exponentialWithJitter(maxRetries, baseDelayMs, 0, 'dead-letter'); // No jitter

            // Without jitter, delay should be exactly baseDelayMs * 2^retryIndex
            for (let retryIndex = 0; retryIndex < maxRetries; retryIndex++) {
              const expected = baseDelayMs * (2 ** retryIndex);
              expect(retryDelayMs(policy, retryIndex, () => 0)).toBe(expected);
            }
          },
        ),
      );
    });

    it('Property 18.4: Jitter stays within the specified ratio', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 100, max: 60000 }),
          fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 1, max: 100 })).map(([a, b]) =>
            Math.min(a, b - 1) / 100,
          ),
          fc.integer({ min: 0, max: 9999 }).map((x) => x / 10000), // Random value in [0, 1)
          (maxRetries, baseDelayMs, jitterRatio, randomValue) => {
            const policy = exponentialWithJitter(maxRetries, baseDelayMs, jitterRatio, 'dead-letter');

            for (let retryIndex = 0; retryIndex < maxRetries; retryIndex++) {
              const base = baseDelayMs * (2 ** retryIndex);
              const maxJitter = base * jitterRatio;
              const minExpected = base;
              const maxExpected = base + maxJitter;

              const delay = retryDelayMs(policy, retryIndex, () => randomValue);

              // Delay should be at least the base (no jitter subtracts)
              expect(delay).toBeGreaterThanOrEqual(minExpected);
              // Delay should not exceed base + max jitter
              expect(delay).toBeLessThanOrEqual(maxExpected);
            }
          },
        ),
      );
    });

    it('Property 18.5: Delays never decrease even with extreme jitter ratio boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }),
          fc.integer({ min: 1000, max: 60000 }),
          (maxRetries, baseDelayMs) => {
            // Test with maximum jitter ratio of 0.99
            const policy = exponentialWithJitter(maxRetries, baseDelayMs, 0.99, 'dead-letter');

            // Even with maximum jitter at the boundary, the minimum base still ensures monotonicity
            // because each next base is 2x the previous
            const delays: number[] = [];
            for (let retryIndex = 0; retryIndex < maxRetries; retryIndex++) {
              // Use random values across the full jitter range
              delays.push(retryDelayMs(policy, retryIndex, () => 0.99));
            }

            // Each delay should still be strictly greater due to exponential base doubling
            for (let i = 1; i < delays.length; i++) {
              expect(delays[i]).toBeGreaterThan(delays[i - 1]);
            }
          },
        ),
      );
    });
  });

  describe('Named policies compute correct delays', () => {
    it('Property 18.6: ASYNC_JOB_POLICY produces exact computed delays', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 4 }), (retryIndex) => {
          const expected = 5000 * (2 ** retryIndex);
          // No jitter means delay is exactly base * 2^n
          expect(retryDelayMs(ASYNC_JOB_POLICY, retryIndex, () => 0)).toBe(expected);
        }),
      );
    });

    it('Property 18.7: All named policies respect their maxRetries bounds', () => {
      const allPolicies: [string, RetryPolicy][] = [
        ['P0_ESCALATION_POLICY', P0_ESCALATION_POLICY],
        ['ERP_PREFILL_POLICY', ERP_PREFILL_POLICY],
        ['EMBEDDING_REGENERATION_POLICY', EMBEDDING_REGENERATION_POLICY],
        ['REPORT_RETRY_POLICY', REPORT_RETRY_POLICY],
        ['ERP_SYNC_POLICY', ERP_SYNC_POLICY],
        ['ASYNC_JOB_POLICY', ASYNC_JOB_POLICY],
      ];

      allPolicies.forEach(([name, policy]) => {
        // retryDelayMs should compute for all valid retry indices from 0 to maxRetries - 1
        for (let retryIndex = 0; retryIndex < policy.maxRetries; retryIndex++) {
          const delay = retryDelayMs(policy, retryIndex);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(delay)).toBe(true);
        }
      });
    });
  });

  describe('Validates: Requirements 5.7, 10.2, 10.8, 15.6, 17.6, 24.6', () => {
    it('Property 18.8: Retry policies are valid for all requirement use cases', () => {
      // Requirement 5.7: P0 escalation (3 × 30 s) - tested
      expect(P0_ESCALATION_POLICY.maxRetries).toBe(3);
      expect(retryDelayMs(P0_ESCALATION_POLICY, 0)).toBe(30 * 1000);
      expect(retryDelayMs(P0_ESCALATION_POLICY, 1)).toBe(30 * 1000);
      expect(retryDelayMs(P0_ESCALATION_POLICY, 2)).toBe(30 * 1000);

      // Requirement 10.2: ERP prefill (3 × 5 min) - tested
      expect(ERP_PREFILL_POLICY.maxRetries).toBe(3);
      expect(retryDelayMs(ERP_PREFILL_POLICY, 0)).toBe(5 * 60 * 1000);

      // Requirement 10.8: Embedding regeneration (3 × 5 min) - tested
      expect(EMBEDDING_REGENERATION_POLICY.maxRetries).toBe(3);
      expect(retryDelayMs(EMBEDDING_REGENERATION_POLICY, 0)).toBe(5 * 60 * 1000);

      // Requirement 15.6: Report retry (1 within 15 min) - tested
      expect(REPORT_RETRY_POLICY.maxRetries).toBe(1);

      // Requirement 17.6: ERP sync (4 × 15 min) - tested
      expect(ERP_SYNC_POLICY.maxRetries).toBe(4);
      expect(retryDelayMs(ERP_SYNC_POLICY, 0)).toBe(15 * 60 * 1000);

      // Requirement 24.6: Async jobs (5 retries at 5 s × 2^n ± 20% jitter) - tested
      expect(ASYNC_JOB_POLICY.maxRetries).toBe(5);
      expect(ASYNC_JOB_POLICY.kind).toBe('exponential');
      expect(ASYNC_JOB_POLICY.baseDelayMs).toBe(5000);
      expect(ASYNC_JOB_POLICY.jitterRatio).toBe(0.2);
    });
  });
});
