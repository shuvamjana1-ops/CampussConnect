// @campusconnect/domain/broadcast: Broadcast audience semantics, approval state machine and delivery counters.
// Pure: no I/O.

/** Default Tenant recipient cap per Broadcast (13.1). */
export const DEFAULT_RECIPIENT_CAP = 50_000;

/** A dimension (department, program, year, hostel, group) matches when the user's value is in `values` (OR). */
export type AudienceDimensions = Readonly<Record<string, readonly string[]>>;

/** A segment is the AND of its dimensions; an empty dimension value list matches nobody. */
export interface AudienceSegment {
  readonly dimensions: AudienceDimensions;
}

export interface AudienceUser {
  readonly userId: string;
  /** Attribute values per dimension, e.g. `{ department: ['CS'], hostel: ['H1'] }`. */
  readonly attributes: Readonly<Record<string, readonly string[]>>;
}

/** True when every dimension has at least one matching value (dimensions AND, values OR). */
export function segmentMatches(segment: AudienceSegment, user: AudienceUser): boolean {
  const entries = Object.entries(segment.dimensions);
  if (entries.length === 0) return false;
  return entries.every(([dim, wanted]) => {
    const have = user.attributes[dim] ?? [];
    return wanted.some((v) => have.includes(v));
  });
}

/** Segments are joined with OR. Returns deduplicated user ids in first-seen order. */
export function resolveAudience(segments: readonly AudienceSegment[], users: readonly AudienceUser[]): string[] {
  const seen = new Set<string>();
  for (const u of users) {
    if (!seen.has(u.userId) && segments.some((s) => segmentMatches(s, u))) seen.add(u.userId);
  }
  return [...seen];
}

/** Deduplicated count of recipient ids. */
export function distinctRecipientCount(recipientIds: readonly string[]): number {
  return new Set(recipientIds).size;
}

export type RecipientCapDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'recipient_cap_exceeded'; readonly count: number; readonly cap: number };

/** Enforces the Tenant recipient cap; emergency alerts are exempt (G2). */
export function checkRecipientCap(count: number, cap: number, isEmergency: boolean): RecipientCapDecision {
  if (isEmergency || count <= cap) return { allowed: true };
  return { allowed: false, reason: 'recipient_cap_exceeded', count, cap };
}

export type BroadcastStatus = 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'rejected';

const TRANSITIONS: Readonly<Record<BroadcastStatus, readonly BroadcastStatus[]>> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  approved: ['sending'],
  sending: ['sent'],
  sent: [],
  rejected: [],
};

export function canTransition(from: BroadcastStatus, to: BroadcastStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Whether a send may begin from `status`. Emergency alerts skip approval and send from `draft`;
 * non-emergency Broadcasts need approval when the Tenant enables it (13.9), otherwise `draft` may send.
 */
export function canSend(status: BroadcastStatus, opts: { isEmergency: boolean; approvalRequired: boolean }): boolean {
  if (opts.isEmergency || !opts.approvalRequired) return status === 'draft' || status === 'approved';
  return status === 'approved';
}

export type RecipientEventType = 'delivered' | 'read' | 'acknowledged';

export interface RecipientEvent {
  readonly recipientId: string;
  readonly type: RecipientEventType;
}

export interface BroadcastCounters {
  readonly delivered: number;
  readonly read: number;
  readonly acknowledged: number;
}

/** Counts distinct recipients per event type; duplicates and ordering do not change the result. */
export function computeCounters(events: readonly RecipientEvent[]): BroadcastCounters {
  const sets: Record<RecipientEventType, Set<string>> = {
    delivered: new Set(),
    read: new Set(),
    acknowledged: new Set(),
  };
  for (const e of events) sets[e.type].add(e.recipientId);
  return { delivered: sets.delivered.size, read: sets.read.size, acknowledged: sets.acknowledged.size };
}

/** Acknowledged recipients divided by total recipients; 0 when there are none. */
export function acknowledgementRate(acknowledged: number, totalRecipients: number): number {
  return totalRecipients <= 0 ? 0 : Math.min(acknowledged / totalRecipients, 1);
}

export interface DeliveryAttempt {
  readonly recipientId: string;
  readonly channel: string;
  readonly succeeded: boolean;
}

export interface FailedDelivery {
  readonly recipientId: string;
  readonly failedChannels: readonly string[];
}

/**
 * Recipients with at least one attempt where every enabled channel failed (no success on any channel).
 * `enabledChannels` lists channels that must all have a failed attempt.
 */
export function failedDeliveryReport(
  attempts: readonly DeliveryAttempt[],
  enabledChannels: readonly string[],
): FailedDelivery[] {
  const byRecipient = new Map<string, { ok: boolean; failed: Set<string> }>();
  for (const a of attempts) {
    const entry = byRecipient.get(a.recipientId) ?? { ok: false, failed: new Set<string>() };
    if (a.succeeded) entry.ok = true;
    else entry.failed.add(a.channel);
    byRecipient.set(a.recipientId, entry);
  }
  const report: FailedDelivery[] = [];
  for (const [recipientId, e] of byRecipient) {
    if (!e.ok && enabledChannels.length > 0 && enabledChannels.every((c) => e.failed.has(c))) {
      report.push({ recipientId, failedChannels: [...e.failed].sort() });
    }
  }
  return report;
}
