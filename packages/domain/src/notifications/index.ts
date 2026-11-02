// @campusconnect/domain/notifications: notification channel planning, retry and fallback.

export type Channel = 'in_app' | 'web_push' | 'email' | 'sms';

export interface ChannelPrefs {
  /** Channels the user has enabled (non-emergency). */
  readonly enabled: readonly Channel[];
  /** Channels the user has an address for (used for emergencies). In-app is always addressable. */
  readonly addressed: readonly Channel[];
  /** True when the delivery moment falls inside the user's quiet hours. */
  readonly inQuietHours: boolean;
}

/** Channel order used for fallback. */
export const FALLBACK_ORDER: readonly Channel[] = ['in_app', 'web_push', 'email'];

/** Delays in seconds for the 3 retries of a failed channel. */
export const RETRY_DELAYS_SEC: readonly number[] = [20, 40, 60];

const ORDER: readonly Channel[] = ['in_app', 'web_push', 'email', 'sms'];

function ordered(channels: ReadonlySet<Channel>): Channel[] {
  return ORDER.filter((c) => channels.has(c));
}

export function planDelivery(
  n: { emergency: boolean },
  prefs: ChannelPrefs,
  tenant: { smsEnabled: boolean },
): Channel[] {
  if (n.emergency) {
    const set = new Set<Channel>(prefs.addressed.filter((c) => c !== 'sms'));
    set.add('in_app');
    if (tenant.smsEnabled) set.add('sms');
    return ordered(set);
  }
  const set = new Set<Channel>();
  for (const c of prefs.enabled) {
    if (c === 'sms') continue;
    if (prefs.inQuietHours && (c === 'web_push' || c === 'email')) continue;
    set.add(c);
  }
  return ordered(set);
}

export interface DeliveryState {
  /** Channel currently failing. */
  readonly channel: Channel;
  /** Retries already made on `channel` (0..3). */
  readonly retriesDone: number;
  /** Channels already attempted for this notification (including `channel`). */
  readonly attempted: readonly Channel[];
}

export type NextStep =
  | { kind: 'retry'; channel: Channel; delaySec: number }
  | { kind: 'fallback'; channel: Channel }
  | { kind: 'exhausted' };

export function nextStep(state: DeliveryState, enabled: readonly Channel[]): NextStep {
  const retryIndex = Math.max(0, state.retriesDone);
  if (retryIndex < RETRY_DELAYS_SEC.length) {
    return { kind: 'retry', channel: state.channel, delaySec: RETRY_DELAYS_SEC[retryIndex] as number };
  }
  const attempted = new Set<Channel>([...state.attempted, state.channel]);
  const next = FALLBACK_ORDER.find((c) => enabled.includes(c) && !attempted.has(c));
  return next ? { kind: 'fallback', channel: next } : { kind: 'exhausted' };
}
