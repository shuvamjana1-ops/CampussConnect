// @campusconnect/domain/auth: session idle expiry, account lockout and rate-limit decisions.

import { Instant } from '../types/index.js';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * Determines whether a session is still valid based on the idle timeout policy.
 * A session is valid if the time elapsed since the last activity is less than the configured idle timeout.
 *
 * Requirements: 2.7
 *
 * @param lastActivity - The instant of the last user activity
 * @param now - The current instant
 * @param idleMinutes - The idle timeout in minutes (must be between 5 and 480)
 * @returns true if the session is still valid (not expired), false otherwise
 */
export function sessionValid(lastActivity: Instant, now: Instant, idleMinutes: number): boolean {
  if (!Number.isInteger(idleMinutes) || idleMinutes < 5 || idleMinutes > 480) {
    throw new RangeError('idleMinutes must be an integer between 5 and 480');
  }

  const elapsedMs = now - lastActivity;
  const timeoutMs = idleMinutes * MINUTE_MS;

  return elapsedMs < timeoutMs;
}

/**
 * Represents the state of an account lockout.
 */
export interface LockoutState {
  /** Whether the account is currently locked */
  readonly isLocked: boolean;
  /** The number of failed attempts since the current window started (not counting attempts during lockout) */
  readonly attempts: number;
  /** The time until the account is unlocked, in seconds (0 if not locked) */
  readonly lockedUntilSeconds: number;
}

/**
 * Policy for account lockout.
 * When the configured number of failures occur within the time window, the account locks for the lock duration.
 */
export interface LockoutPolicy {
  readonly maxAttempts: number; // 5 failures
  readonly windowSeconds: number; // 15 minutes
  readonly lockSeconds: number; // 15 minutes
}

/** Standard lockout policy: 5 failures within 15 minutes lock for 15 minutes (2.9) */
export const STANDARD_LOCKOUT_POLICY: LockoutPolicy = {
  maxAttempts: 5,
  windowSeconds: (15 * MINUTE_MS) / SECOND_MS,
  lockSeconds: (15 * MINUTE_MS) / SECOND_MS,
};

/**
 * Attempt record: timestamp of a failed attempt.
 */
export interface AttemptRecord {
  readonly failedAt: Instant;
}

/**
 * Determines the current lockout state of an account based on its attempt history.
 *
 * When `maxAttempts` failures occur within the `windowSeconds`, the account locks
 * at the time of the maxAttempts-th failure, for `lockSeconds` duration.
 * Attempts during lockout are rejected and not recorded.
 *
 * Requirements: 2.9
 *
 * @param attempts - Array of failed attempt records (should be in chronological order)
 * @param now - The current instant
 * @param policy - The lockout policy to apply
 * @returns The current lockout state
 */
export function lockoutState(attempts: AttemptRecord[], now: Instant, policy: LockoutPolicy): LockoutState {
  if (!Array.isArray(attempts)) {
    throw new TypeError('attempts must be an array');
  }

  if (attempts.length === 0) {
    return {
      isLocked: false,
      attempts: 0,
      lockedUntilSeconds: 0,
    };
  }

  // Find the most recent lockout trigger by scanning through attempts
  // A lockout triggers when we find maxAttempts within a windowSeconds period
  let lockTriggeredAt: Instant | undefined;

  // Look for any position where maxAttempts occurred within the window
  for (let i = attempts.length - 1; i >= policy.maxAttempts - 1; i--) {
    const thisMoment = attempts[i].failedAt;
    const windowStart = thisMoment - policy.windowSeconds * SECOND_MS;

    // Count how many attempts fall within [windowStart, thisMoment]
    let count = 0;
    for (let j = i; j >= 0 && attempts[j].failedAt >= windowStart; j--) {
      count++;
    }

    if (count >= policy.maxAttempts) {
      lockTriggeredAt = thisMoment;
      break; // We found the most recent lockout trigger
    }
  }

  if (lockTriggeredAt !== undefined) {
    const lockExpiresAt = lockTriggeredAt + policy.lockSeconds * SECOND_MS;

    if (now < lockExpiresAt) {
      // Currently in lockout
      const remainingSeconds = Math.ceil((lockExpiresAt - now) / SECOND_MS);
      return {
        isLocked: true,
        attempts: 0,
        lockedUntilSeconds: remainingSeconds,
      };
    }
  }

  // Account is not locked; count recent attempts within the current window
  const windowStartMs = now - policy.windowSeconds * SECOND_MS;
  const recentAttempts = attempts.filter((a) => a.failedAt >= windowStartMs);

  return {
    isLocked: false,
    attempts: recentAttempts.length,
    lockedUntilSeconds: 0,
  };
}

/**
 * Represents the decision for a rate-limit check.
 */
export interface RateLimitDecision {
  /** Whether the request is allowed */
  readonly allowed: boolean;
  /** If not allowed, the number of seconds to wait before retrying (0 if allowed) */
  readonly retryAfterSeconds: number;
}

/**
 * Determines whether a request is allowed under a sliding-window rate limit.
 * Uses a sliding window approach: only counts requests within the window.
 *
 * Requirements: 22.7, 22.8
 *
 * @param requests - Array of request timestamps (should be in chronological order)
 * @param limit - The maximum number of requests allowed per window
 * @param windowSec - The size of the sliding window in seconds
 * @param now - The current instant
 * @returns The rate-limit decision
 */
export function rateLimitDecision(
  requests: Instant[],
  limit: number,
  windowSec: number,
  now: Instant,
): RateLimitDecision {
  if (!Array.isArray(requests)) {
    throw new TypeError('requests must be an array');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('limit must be a positive integer');
  }
  if (!Number.isFinite(windowSec) || windowSec <= 0) {
    throw new RangeError('windowSec must be a positive number');
  }

  // Define the window boundaries
  const windowStartMs = now - windowSec * SECOND_MS;

  // Count requests within the current window
  const requestsInWindow = requests.filter((t) => t >= windowStartMs);

  if (requestsInWindow.length < limit) {
    // We're under the limit
    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  // We're at or over the limit; find when we can retry
  // The oldest request in the window determines when the window slides past it
  const oldestInWindow = requestsInWindow[0];
  const windowEndsAt = oldestInWindow + windowSec * SECOND_MS;
  const retryAfterMs = Math.max(0, windowEndsAt - now);
  const retryAfterSeconds = Math.ceil(retryAfterMs / SECOND_MS);

  return {
    allowed: false,
    retryAfterSeconds,
  };
}
