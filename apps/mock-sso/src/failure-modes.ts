/**
 * Switchable failure modes, so the sign-in failure paths can be tested (2.9, 2.10):
 * - `none`: normal behaviour.
 * - `unavailable`: the authorize endpoint redirects back with `temporarily_unavailable`;
 *   the token and discovery endpoints answer 503.
 * - `slow`: every protocol response is delayed by `delayMs` (default 15 s, beyond the 10-second client deadline).
 * - `wrong_password`: every credential check fails as if the password were wrong.
 */
export const FAILURE_MODES = ['none', 'unavailable', 'slow', 'wrong_password'] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

export interface FailureModeSetting {
  readonly mode: FailureMode;
  /** Delay applied in `slow` mode. Ignored by the other modes. */
  readonly delayMs: number;
}

export const DEFAULT_SLOW_DELAY_MS = 15_000;
export const MAX_SLOW_DELAY_MS = 120_000;

export const NORMAL_OPERATION: FailureModeSetting = { mode: 'none', delayMs: DEFAULT_SLOW_DELAY_MS };

export class FailureModeError extends Error {
  override readonly name = 'FailureModeError';
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

function isFailureMode(value: unknown): value is FailureMode {
  return typeof value === 'string' && (FAILURE_MODES as readonly string[]).includes(value);
}

/** Validates a failure mode request body such as `{ "mode": "slow", "delayMs": 12000 }`. */
export function parseFailureModeSetting(input: unknown): FailureModeSetting {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new FailureModeError('', 'Body must be a JSON object');
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'mode' && key !== 'delayMs') {
      throw new FailureModeError(key, `Unknown field "${key}"`);
    }
  }
  const { mode, delayMs } = record;
  if (!isFailureMode(mode)) {
    throw new FailureModeError('mode', `mode must be one of ${FAILURE_MODES.join(', ')}`);
  }
  if (delayMs === undefined) {
    return { mode, delayMs: DEFAULT_SLOW_DELAY_MS };
  }
  if (typeof delayMs !== 'number' || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > MAX_SLOW_DELAY_MS) {
    throw new FailureModeError('delayMs', `delayMs must be a whole number from 0 to ${String(MAX_SLOW_DELAY_MS)}`);
  }
  return { mode, delayMs };
}
