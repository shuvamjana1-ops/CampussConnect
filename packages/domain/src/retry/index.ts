// @campusconnect/domain/retry: retry policies and the retry executor.
// Pure: sleeping, randomness and the terminal action are injected, so no I/O happens here.

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** What happens, exactly once, when every attempt has failed. */
export type TerminalAction = 'flag' | 'notify' | 'dead-letter';

interface PolicyBase {
  /** Retries after the first attempt; total attempts are at most `1 + maxRetries`. */
  readonly maxRetries: number;
  readonly terminal: TerminalAction;
}

/** Every retry waits the same `delayMs`. */
export interface FixedIntervalPolicy extends PolicyBase {
  readonly kind: 'fixed';
  readonly delayMs: number;
}

/** Retry `n` (0-based) waits `baseDelayMs * 2^n` plus up to `jitterRatio` of that, so delays strictly increase. */
export interface ExponentialJitterPolicy extends PolicyBase {
  readonly kind: 'exponential';
  readonly baseDelayMs: number;
  /** Maximum extra delay as a fraction of the exponential delay; must be in [0, 1). */
  readonly jitterRatio: number;
}

export type RetryPolicy = FixedIntervalPolicy | ExponentialJitterPolicy;

export function fixedInterval(maxRetries: number, delayMs: number, terminal: TerminalAction): FixedIntervalPolicy {
  assertCount(maxRetries);
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('delayMs must be a non-negative number');
  return { kind: 'fixed', maxRetries, delayMs, terminal };
}

export function exponentialWithJitter(
  maxRetries: number,
  baseDelayMs: number,
  jitterRatio: number,
  terminal: TerminalAction,
): ExponentialJitterPolicy {
  assertCount(maxRetries);
  if (!Number.isFinite(baseDelayMs) || baseDelayMs <= 0) throw new RangeError('baseDelayMs must be positive');
  // A ratio below 1 keeps delay n's maximum under delay n+1's minimum (n+1 doubles), so delays strictly increase.
  if (!(jitterRatio >= 0 && jitterRatio < 1)) throw new RangeError('jitterRatio must be in [0, 1)');
  return { kind: 'exponential', maxRetries, baseDelayMs, jitterRatio, terminal };
}

function assertCount(maxRetries: number): void {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new RangeError('maxRetries must be a non-negative integer');
}

/** P0 escalation notifications: 3 retries, 30 s apart; then flag `escalationFailed` (5.7). */
export const P0_ESCALATION_POLICY: RetryPolicy = fixedInterval(3, 30 * SECOND_MS, 'flag');
/** ERP profile prefill: 3 retries, 5 min apart; then notify the student (10.2). */
export const ERP_PREFILL_POLICY: RetryPolicy = fixedInterval(3, 5 * MINUTE_MS, 'notify');
/** Embedding regeneration: 3 retries, 5 min apart; then flag `embeddingStale` (10.8). */
export const EMBEDDING_REGENERATION_POLICY: RetryPolicy = fixedInterval(3, 5 * MINUTE_MS, 'flag');
/** Scheduled report: one retry within 15 minutes of the failure; then notify the owner (15.6). */
export const REPORT_RETRY_POLICY: RetryPolicy = fixedInterval(1, 10 * MINUTE_MS, 'notify');
/** ERP sync: 4 attempts per cycle at 15 min intervals, i.e. up to 4 retries; then flag the data as stale (17.6). */
export const ERP_SYNC_POLICY: RetryPolicy = fixedInterval(4, 15 * MINUTE_MS, 'flag');
/** Async jobs: 5 retries at `5 s * 2^n` plus up to 20% jitter; then dead-letter (24.6). */
export const ASYNC_JOB_POLICY: RetryPolicy = exponentialWithJitter(5, 5 * SECOND_MS, 0.2, 'dead-letter');

/**
 * Delay in ms before retry `retryIndex` (0-based). `random` returns a value in [0, 1) and is only used by
 * exponential policies.
 */
export function retryDelayMs(policy: RetryPolicy, retryIndex: number, random: () => number = Math.random): number {
  if (policy.kind === 'fixed') return policy.delayMs;
  const base = policy.baseDelayMs * 2 ** retryIndex;
  const r = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  return Math.floor(base + base * policy.jitterRatio * r);
}

export interface RetryDeps {
  readonly sleep: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /** Runs the policy's terminal action. Called exactly once, and only if every attempt failed. */
  readonly onTerminal?: (action: TerminalAction, lastError: unknown, attempts: number) => void | Promise<void>;
}

export type RetryOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly attempts: number }
  | { readonly ok: false; readonly error: unknown; readonly attempts: number; readonly terminal: TerminalAction };

/**
 * Runs `operation` (receiving the 1-based attempt number) up to `1 + maxRetries` times, stopping at the first
 * success. A thrown or rejected attempt counts as a failure. After the last failure it runs the terminal action once.
 */
export async function executeWithRetry<T>(
  policy: RetryPolicy,
  operation: (attempt: number) => T | Promise<T>,
  deps: RetryDeps,
): Promise<RetryOutcome<T>> {
  const totalAttempts = 1 + policy.maxRetries;
  let lastError: unknown;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const value = await operation(attempt);
      return { ok: true, value, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
    if (attempt < totalAttempts) await deps.sleep(retryDelayMs(policy, attempt - 1, deps.random));
  }
  await deps.onTerminal?.(policy.terminal, lastError, totalAttempts);
  return { ok: false, error: lastError, attempts: totalAttempts, terminal: policy.terminal };
}
