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

describe('sessionValid', () => {
  it('returns true when session has not exceeded idle timeout', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 5 * MINUTE_MS); // 5 minutes ago
    const idleMinutes = 30;

    expect(sessionValid(lastActivity, now, idleMinutes)).toBe(true);
  });

  it('returns false when session exceeds idle timeout', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 31 * MINUTE_MS); // 31 minutes ago
    const idleMinutes = 30;

    expect(sessionValid(lastActivity, now, idleMinutes)).toBe(false);
  });

  it('returns false when idle time exactly equals timeout', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 30 * MINUTE_MS); // exactly 30 minutes ago
    const idleMinutes = 30;

    expect(sessionValid(lastActivity, now, idleMinutes)).toBe(false);
  });

  it('returns true when idle time is just under timeout', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 30 * MINUTE_MS + 1);
    const idleMinutes = 30;

    expect(sessionValid(lastActivity, now, idleMinutes)).toBe(true);
  });

  it('respects configured idle timeout range', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 5 * MINUTE_MS);

    // Valid range: 5 to 480 minutes
    expect(sessionValid(lastActivity, now, 5)).toBe(true);
    expect(sessionValid(lastActivity, now, 480)).toBe(true);
  });

  it('rejects invalid idle timeout values', () => {
    const now = instant(1000000);
    const lastActivity = instant(now - 5 * MINUTE_MS);

    expect(() => sessionValid(lastActivity, now, 4)).toThrow(RangeError);
    expect(() => sessionValid(lastActivity, now, 481)).toThrow(RangeError);
    expect(() => sessionValid(lastActivity, now, 30.5)).toThrow(RangeError);
  });
});

describe('lockoutState', () => {
  it('returns unlocked state when no attempts exist', () => {
    const now = instant(1000000);
    const state = lockoutState([], now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(false);
    expect(state.attempts).toBe(0);
    expect(state.lockedUntilSeconds).toBe(0);
  });

  it('locks account after 5 failures within 15 minutes', () => {
    const now = instant(1000000);
    const attempts: AttemptRecord[] = [
      { failedAt: instant(now - 14 * MINUTE_MS) },
      { failedAt: instant(now - 12 * MINUTE_MS) },
      { failedAt: instant(now - 10 * MINUTE_MS) },
      { failedAt: instant(now - 5 * MINUTE_MS) },
      { failedAt: instant(now - 1 * MINUTE_MS) },
    ];

    const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(true);
    expect(state.lockedUntilSeconds).toBeGreaterThan(0);
  });

  it('counts attempts only within the window', () => {
    const now = instant(1000000);
    const attempts: AttemptRecord[] = [
      { failedAt: instant(now - 20 * MINUTE_MS) }, // Outside 15-minute window
      { failedAt: instant(now - 10 * MINUTE_MS) },
      { failedAt: instant(now - 5 * MINUTE_MS) },
    ];

    const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(false);
    expect(state.attempts).toBe(2); // Only the 2 recent attempts
  });

  it('returns non-zero remaining time while locked', () => {
    const now = instant(1000000);
    const lockoutTriggeredAt = instant(now - 14 * MINUTE_MS);

    const attempts: AttemptRecord[] = [
      { failedAt: instant(lockoutTriggeredAt - 4 * MINUTE_MS) },
      { failedAt: instant(lockoutTriggeredAt - 3 * MINUTE_MS) },
      { failedAt: instant(lockoutTriggeredAt - 2 * MINUTE_MS) },
      { failedAt: instant(lockoutTriggeredAt - 1 * MINUTE_MS) },
      { failedAt: lockoutTriggeredAt }, // This triggered the lockout
    ];

    const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(true);
    expect(state.attempts).toBe(0); // Attempts during lockout are not counted
    expect(state.lockedUntilSeconds).toBeGreaterThan(0);
    expect(state.lockedUntilSeconds).toBeLessThanOrEqual(STANDARD_LOCKOUT_POLICY.lockSeconds);
  });

  it('unlocks after lock duration expires', () => {
    const lockStartedAt = instant(1000000);
    const now = instant(lockStartedAt + 16 * MINUTE_MS); // More than 15 minutes later

    const attempts: AttemptRecord[] = [
      { failedAt: instant(lockStartedAt - 4 * MINUTE_MS) },
      { failedAt: instant(lockStartedAt - 3 * MINUTE_MS) },
      { failedAt: instant(lockStartedAt - 2 * MINUTE_MS) },
      { failedAt: instant(lockStartedAt - 1 * MINUTE_MS) },
      { failedAt: lockStartedAt },
    ];

    const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(false);
    expect(state.lockedUntilSeconds).toBe(0);
  });

  it('resets attempt count when window slides', () => {
    const now = instant(1000000);
    const attempts: AttemptRecord[] = [
      { failedAt: instant(now - 20 * MINUTE_MS) }, // Outside window
      { failedAt: instant(now - 1 * MINUTE_MS) },
    ];

    const state = lockoutState(attempts, now, STANDARD_LOCKOUT_POLICY);

    expect(state.isLocked).toBe(false);
    expect(state.attempts).toBe(1);
  });
});

describe('rateLimitDecision', () => {
  it('allows request when under limit', () => {
    const now = instant(1000000);
    const requests: Instant[] = [instant(now - 10 * SECOND_MS), instant(now - 5 * SECOND_MS)];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(true);
    expect(decision.retryAfterSeconds).toBe(0);
  });

  it('denies request when at limit', () => {
    const now = instant(1000000);
    const requests: Instant[] = [
      instant(now - 50 * SECOND_MS),
      instant(now - 40 * SECOND_MS),
      instant(now - 30 * SECOND_MS),
      instant(now - 20 * SECOND_MS),
      instant(now - 10 * SECOND_MS),
    ];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('denies request when over limit', () => {
    const now = instant(1000000);
    const requests: Instant[] = [
      instant(now - 50 * SECOND_MS),
      instant(now - 40 * SECOND_MS),
      instant(now - 30 * SECOND_MS),
      instant(now - 20 * SECOND_MS),
      instant(now - 10 * SECOND_MS),
      instant(now - 5 * SECOND_MS),
    ];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('ignores requests outside the window', () => {
    const now = instant(1000000);
    const requests: Instant[] = [
      instant(now - 100 * SECOND_MS), // Outside 60-second window
      instant(now - 50 * SECOND_MS),
      instant(now - 40 * SECOND_MS),
    ];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(true);
    expect(decision.retryAfterSeconds).toBe(0);
  });

  it('calculates correct retry-after time', () => {
    const now = instant(1000000);
    const oldestRequestInWindow = instant(now - 50 * SECOND_MS);
    const requests: Instant[] = [
      oldestRequestInWindow,
      instant(now - 40 * SECOND_MS),
      instant(now - 30 * SECOND_MS),
      instant(now - 20 * SECOND_MS),
      instant(now - 10 * SECOND_MS),
    ];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(false);
    // The window will slide past the oldest request after (windowSec - elapsed) seconds
    // oldest request is 50 seconds old, window is 60 seconds
    // so retry after 60 - 50 = 10 seconds
    expect(decision.retryAfterSeconds).toBe(10);
  });

  it('rounds up retry-after time', () => {
    const now = instant(1000000);
    const requests: Instant[] = [
      instant(now - 50500), // 50.5 seconds old
      instant(now - 40 * SECOND_MS),
      instant(now - 30 * SECOND_MS),
      instant(now - 20 * SECOND_MS),
      instant(now - 10 * SECOND_MS),
    ];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(10); // Ceiling of 9.5 seconds
  });

  it('returns empty list with no requests', () => {
    const now = instant(1000000);
    const requests: Instant[] = [];
    const limit = 5;
    const windowSec = 60;

    const decision = rateLimitDecision(requests, limit, windowSec, now);

    expect(decision.allowed).toBe(true);
    expect(decision.retryAfterSeconds).toBe(0);
  });

  it('validates input parameters', () => {
    const now = instant(1000000);
    const requests: Instant[] = [instant(now - 10 * SECOND_MS)];

    expect(() => rateLimitDecision(requests, 0, 60, now)).toThrow(RangeError);
    expect(() => rateLimitDecision(requests, -1, 60, now)).toThrow(RangeError);
    expect(() => rateLimitDecision(requests, 5, 0, now)).toThrow(RangeError);
    expect(() => rateLimitDecision(requests, 5, -1, now)).toThrow(RangeError);
    expect(() => rateLimitDecision(requests, 5.5, 60, now)).toThrow(RangeError);
  });
});
