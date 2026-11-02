// @campusconnect/domain/emergency: emergency alert resend decision.

export const EMERGENCY_RESEND_AFTER_MS = 5 * 60 * 1000;

export interface EmergencyTimeline {
  /** Epoch ms when the alert was delivered to the recipient. */
  readonly deliveredAt: number;
  /** Epoch ms when the recipient acknowledged, if ever. */
  readonly acknowledgedAt?: number | null;
  /** Epoch ms of a previous resend, if one already happened. */
  readonly resentAt?: number | null;
  /** Epoch ms of the evaluation instant. */
  readonly now: number;
}

export type ResendDecision =
  | { readonly resend: true; readonly channel: string }
  | { readonly resend: false };

/**
 * Resend exactly once when the alert is unacknowledged 5 minutes after delivery
 * (an acknowledgement at or before that point counts) and an unused channel exists.
 */
export function resendDecision(
  timeline: EmergencyTimeline,
  channelsUsed: readonly string[],
  channelsAvailable: readonly string[],
): ResendDecision {
  if (timeline.resentAt != null) return { resend: false };
  const deadline = timeline.deliveredAt + EMERGENCY_RESEND_AFTER_MS;
  if (timeline.now < deadline) return { resend: false };
  if (timeline.acknowledgedAt != null && timeline.acknowledgedAt <= deadline) {
    return { resend: false };
  }
  const used = new Set(channelsUsed);
  const channel = channelsAvailable.find((c) => !used.has(c));
  return channel === undefined ? { resend: false } : { resend: true, channel };
}
