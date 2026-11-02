// Feature: campusconnect-platform, Properties 4, 5, 64: Session, Lockout, and Rate Limit

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { instant, type Instant } from '../src/types/index.js';
import {
  lockoutState,
  rateLimitDecision,
  sessionValid,
  STANDARD_LOCKOUT_POLICY,
  type AttemptRecord,
} from '../src/auth/index.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

describe('Property 4: Session idle expiry', () => {
  /**
   * Validates: Requirements 2.7
   */
  it('a session is valid if and only if elapsed time is less than the timeout', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 480 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (idleMinutes, baseTime, elapsedMs) => {
          const now = instant(baseTime + elapsedMs * MINUTE_MS);
          const lastActivity = instant(baseTime);

          const timeoutMs = idleMinutes * MINUTE_MS;
          const isValid = sessionValid(lastActivity, now, idleMinutes);

          expect(isValid).toBe(elapsedMs < idleMinutes);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects invalid idle timeout values', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }).filter((v) => v < 5 || v > 480), (idleMinutes) => {
        const now = instant(1000000);
        const lastActivity = instant(500000);

        expect(() => sessionValid(lastActivity, now, idleMinutes)).toThrow();
      }),
    );
  });

  it('session validity is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 480 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (idleMinutes, baseTime) => {
          const now = instant(baseTime + 10 * MINUTE_MS);
          const lastActivity = instant(baseTime);

          const first = sessionValid(lastActivity, now, idleMinutes);
          const second = sessionValid(lastActivity, now, idleMinutes);

          expect(first).toBe(second);
        },
      ),
    );
  });
});

/**
 * Reference model for account lockout behavior.
 * This model encodes the specification (requirement 2.9):
 * - 5 failures within 15 minutes lock for 15 minutes
 * - Attempts during lockout are rejected and not counted
 * - Failed MFA also counts as a failure
 *
 * This is a simple, obviously-correct implementation used to validate the production implementation.
 */
function referenceLockoutModel(
  attempts: AttemptRecord[],
  now: Instant,
  policy: { maxAttempts: number; windowSeconds: number; lockSeconds: number },
): { isLocked: boolean; attempts: number; lockedUntilSeconds: number } {
  const SECOND_MS = 1000;

  if (attempts.length === 0) {
    return { isLocked: false, attempts: 0, lockedUntilSeconds: 0 };
  }

  // Find the most recent lockout trigger by scanning backwards
  // A lockout is triggered at position i if there are maxAttempts attempts
  // within [attempts[i].failedAt - windowSeconds, attempts[i].failedAt]
  let lockTriggeredAt: Instant | undefined;

  // Scan from the end backwards
  for (let i = attempts.length - 1; i >= policy.maxAttempts - 1; i--) {
    const thisMoment = attempts[i].failedAt;
    const windowStart = thisMoment - policy.windowSeconds * SECOND_MS;

    // Count how many attempts fall within [windowStart, thisMoment]
    let count = 0;
    for (let j = i; j >= 0 && attempts[j].failedAt >= windowStart; j--) {
      count++;
    }

    if (count >= policy.maxAttempts) {
      // Found the most recent lockout trigger at this position
      lockTriggeredAt = thisMoment;
      break;
    }
  }

  // If a lockout was triggered, check if we're still in it
  if (lockTriggeredAt !== undefined) {
    const lockExpiresAt = lockTriggeredAt + policy.lockSeconds * SECOND_MS;
    if (now < lockExpiresAt) {
      // Currently in lockout; attempts count as 0 because new attempts are rejected
      const remainingSeconds = Math.ceil((lockExpiresAt - now) / SECOND_MS);
      return { isLocked: true, attempts: 0, lockedUntilSeconds: remainingSeconds };
    }
  }

  // Not currently locked; count attempts within the current sliding window
  const windowStart = now - policy.windowSeconds * SECOND_MS;
  const recentAttempts = attempts.filter((a) => a.failedAt >= windowStart);

  return { isLocked: false, attempts: recentAttempts.length, lockedUntilSeconds: 0 };
}

describe('Property 5: Account lockout', () => {
  /**
   * Validates: Requirements 2.9
   *
   * Compares the production implementation against a reference model to verify:
   * - Lockout triggers after maxAttempts within the window
   * - Lockout lasts for the specified duration
   * - Attempts are correctly counted only within the window
   * - Attempts during lockout are rejected (attempts count is 0 when locked)
   */
  it('lockout behavior matches the reference model across all scenarios', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 8.64e15 }),
          fc.integer({ min: 0, max: 8.64e15 }),
        ),
        ([numAttempts, baseTime, nowOffset]) => {
          const now = instant(baseTime + nowOffset);

          // Generate attempts spread across different time windows
          const attempts: AttemptRecord[] = Array.from({ length: numAttempts }, (_, i) => ({
            failedAt: instant(baseTime + i * SECOND_MS * 30), // 30 seconds apart
          }));

          const production = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);
          const reference = referenceLockoutModel(attempts, now, STANDARD_LOCKOUT_POLICY);

          // All three fields must match exactly
          expect(production.isLocked).toBe(reference.isLocked, 'isLocked mismatch');
          expect(production.attempts).toBe(reference.attempts, 'attempts count mismatch');
          expect(production.lockedUntilSeconds).toBe(reference.lockedUntilSeconds, 'lockedUntilSeconds mismatch');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('an account locks when maxAttempts occur within the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        (baseTime) => {
          const now = instant(baseTime + 1000); // Now is 1 second after the lock
          const lockTriggeredAt = instant(baseTime);

          const attempts: AttemptRecord[] = [
            { failedAt: instant(baseTime - 14 * MINUTE_MS) },
            { failedAt: instant(baseTime - 12 * MINUTE_MS) },
            { failedAt: instant(baseTime - 10 * MINUTE_MS) },
            { failedAt: instant(baseTime - 5 * MINUTE_MS) },
            { failedAt: lockTriggeredAt }, // 5th attempt triggers lock
          ];

          const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          expect(state.isLocked).toBe(true);
          expect(state.attempts).toBe(0);
          expect(state.lockedUntilSeconds).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('an account does not lock with fewer than maxAttempts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        fc.integer({ min: 0, max: STANDARD_LOCKOUT_POLICY.maxAttempts - 1 }),
        (baseTime, numAttempts) => {
          const now = instant(baseTime + 100);

          const attempts: AttemptRecord[] = Array.from({ length: numAttempts }, (_, i) => ({
            failedAt: instant(baseTime - (numAttempts - i) * MINUTE_MS),
          }));

          const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          expect(state.isLocked).toBe(false);
          expect(state.attempts).toBe(numAttempts);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('an account unlocks after the lock duration expires', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        (baseTime) => {
          const lockTriggeredAt = instant(baseTime);
          const lockExpiresAt = instant(lockTriggeredAt + STANDARD_LOCKOUT_POLICY.lockSeconds * SECOND_MS);
          const now = instant(lockExpiresAt + 1000); // 1 second after lock expires

          const attempts: AttemptRecord[] = [
            { failedAt: instant(lockTriggeredAt - 4 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 3 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 2 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 1 * MINUTE_MS) },
            { failedAt: lockTriggeredAt },
          ];

          const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          expect(state.isLocked).toBe(false);
          expect(state.lockedUntilSeconds).toBe(0);
        },
      ),
    );
  });

  it('counts attempts only within the current window when not locked', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        (baseTime) => {
          const now = instant(baseTime);

          const oldAttempt = instant(baseTime - (STANDARD_LOCKOUT_POLICY.windowSeconds + 60) * SECOND_MS);
          const recentAttempt1 = instant(baseTime - 10 * SECOND_MS);
          const recentAttempt2 = instant(baseTime - 5 * SECOND_MS);

          const attempts: AttemptRecord[] = [
            { failedAt: oldAttempt },
            { failedAt: recentAttempt1 },
            { failedAt: recentAttempt2 },
          ];

          const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          expect(state.isLocked).toBe(false);
          expect(state.attempts).toBe(2); // Only the 2 recent attempts
        },
      ),
    );
  });

  it('lockout state is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        (baseTime) => {
          const now = instant(baseTime + 1000);

          const attempts: AttemptRecord[] = [
            { failedAt: instant(baseTime - 4 * MINUTE_MS) },
            { failedAt: instant(baseTime - 3 * MINUTE_MS) },
            { failedAt: instant(baseTime - 2 * MINUTE_MS) },
            { failedAt: instant(baseTime - 1 * MINUTE_MS) },
            { failedAt: instant(baseTime) },
          ];

          const first = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);
          const second = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          expect(first).toEqual(second);
        },
      ),
    );
  });

  it('lockout expires at exactly the lock duration boundary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8.64e15 }),
        (baseTime) => {
          const lockTriggeredAt = instant(baseTime);
          const lockExpiresAt = instant(lockTriggeredAt + STANDARD_LOCKOUT_POLICY.lockSeconds * SECOND_MS);

          const attempts: AttemptRecord[] = [
            { failedAt: instant(lockTriggeredAt - 4 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 3 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 2 * MINUTE_MS) },
            { failedAt: instant(lockTriggeredAt - 1 * MINUTE_MS) },
            { failedAt: lockTriggeredAt },
          ];

          // Just before expiry: should be locked
          const justBefore = instant(lockExpiresAt - 1);
          const stateBefore = lockoutState(attempts, justBefore, STANDARD_LOCKOUT_POLICY);
          expect(stateBefore.isLocked).toBe(true);

          // At expiry: should be unlocked
          const atExpiry = instant(lockExpiresAt);
          const stateAt = lockoutState(attempts, atExpiry, STANDARD_LOCKOUT_POLICY);
          expect(stateAt.isLocked).toBe(false);
        },
      ),
    );
  });

  it('correctly handles attempt sequences with gaps and retries', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 0, max: 8.64e15 }),
        ),
        ([cycleCount, baseTime]) => {
          // Create multiple cycles: lock -> unlock -> attempt again
          let attempts: AttemptRecord[] = [];
          let currentTime = instant(baseTime);

          for (let cycle = 0; cycle < cycleCount; cycle++) {
            // Add 5 attempts that trigger a lock
            const cycleStart = currentTime;
            for (let i = 0; i < STANDARD_LOCKOUT_POLICY.maxAttempts; i++) {
              attempts.push({
                failedAt: instant(cycleStart + i * MINUTE_MS),
              });
            }

            // Move time past the lock expiry to reset
            currentTime = instant(cycleStart + (STANDARD_LOCKOUT_POLICY.lockSeconds + 60) * SECOND_MS);
          }

          // Now test with a time beyond all attempts
          const now = instant(currentTime + 60 * SECOND_MS);
          const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

          // Should not be locked (past all lockout windows)
          expect(state.isLocked).toBe(false);
          // Should have 0 attempts in the current window
          expect(state.attempts).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Property 64: Rate limiting', () => {
  /**
   * Validates: Requirements 22.7, 22.8
   */
  it('allows requests when under the limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 3600 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (limit, windowSec, baseTime) => {
          const now = instant(baseTime);

          // Generate fewer requests than the limit
          const requests: Instant[] = Array.from({ length: Math.min(limit - 1, 10) }, (_, i) =>
            instant(baseTime - (limit - i) * SECOND_MS),
          );

          const decision = rateLimitDecision(requests, limit, windowSec, now);

          expect(decision.allowed).toBe(true);
          expect(decision.retryAfterSeconds).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('denies requests when at or over the limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 10, max: 3600 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (limit, windowSec, baseTime) => {
          const now = instant(baseTime);

          // Generate exactly `limit` requests within the window
          const requests: Instant[] = Array.from({ length: limit }, (_, i) =>
            instant(baseTime - (limit - i - 1) * (windowSec * SECOND_MS) / limit),
          );

          const decision = rateLimitDecision(requests, limit, windowSec, now);

          expect(decision.allowed).toBe(false);
          expect(decision.retryAfterSeconds).toBeGreaterThan(0);
          expect(decision.retryAfterSeconds).toBeLessThanOrEqual(windowSec);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ignores requests outside the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 10, max: 3600 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (limit, windowSec, baseTime) => {
          const now = instant(baseTime);

          // Generate old requests (outside window) and recent requests (inside window)
          const requests: Instant[] = [
            instant(baseTime - (windowSec + 100) * SECOND_MS), // Outside window
            instant(baseTime - (windowSec + 50) * SECOND_MS), // Outside window
            instant(baseTime - 10 * SECOND_MS), // Inside window
            instant(baseTime - 5 * SECOND_MS), // Inside window
          ];

          const decision = rateLimitDecision(requests, limit, windowSec, now);

          // Only 2 requests are in the window, so should be allowed
          expect(decision.allowed).toBe(true);
          expect(decision.retryAfterSeconds).toBe(0);
        },
      ),
    );
  });

  it('rate-limit decision is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 3600 }),
        fc.integer({ min: 0, max: 8.64e15 }),
        (limit, windowSec, baseTime) => {
          const now = instant(baseTime);

          const requests: Instant[] = Array.from({ length: Math.min(limit + 2, 10) }, (_, i) =>
            instant(baseTime - i * SECOND_MS),
          );

          const first = rateLimitDecision(requests, limit, windowSec, now);
          const second = rateLimitDecision(requests, limit, windowSec, now);

          expect(first).toEqual(second);
        },
      ),
    );
  });

  it('rejects invalid parameters', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.float({ noDefaultInfinity: true }).filter((v) => !Number.isFinite(v) || v <= 0),
        ),
        (invalidLimit) => {
          const now = instant(1000000);
          const requests: Instant[] = [];

          expect(() => rateLimitDecision(requests, invalidLimit, 60, now)).toThrow();
        },
      ),
    );
  });
});
