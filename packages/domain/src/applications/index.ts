// @campusconnect/domain/applications: application states, document links and deadline reminders.

export const APPLICATION_STATES = ['Saved', 'Preparing', 'Submitted', 'Outcome'] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const OUTCOME_VALUES = ['Selected', 'Not Selected', 'Withdrawn'] as const;
export type OutcomeValue = (typeof OUTCOME_VALUES)[number];

export const MAX_LINKS_PER_DOCUMENT = 50;
export const REMINDER_KINDS = ['d7', 'd3'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_OFFSET_DAYS: Readonly<Record<ReminderKind, number>> = { d7: 7, d3: 3 };

export function isApplicationState(value: unknown): value is ApplicationState {
  return typeof value === 'string' && (APPLICATION_STATES as readonly string[]).includes(value);
}

export function isOutcomeValue(value: unknown): value is OutcomeValue {
  return typeof value === 'string' && (OUTCOME_VALUES as readonly string[]).includes(value);
}

export interface Application {
  readonly state: ApplicationState;
  readonly outcome?: OutcomeValue | null;
}

export type OutcomeResult =
  | { readonly ok: true; readonly application: Application }
  | { readonly ok: false; readonly allowed: readonly OutcomeValue[]; readonly application: Application };

/** Records an outcome; invalid values are rejected with the allowed list and the previous state retained. */
export function setOutcome(application: Application, outcome: unknown): OutcomeResult {
  if (!isOutcomeValue(outcome)) {
    return { ok: false, allowed: OUTCOME_VALUES, application };
  }
  return { ok: true, application: { state: 'Outcome', outcome } };
}

/** Changes state; unknown states are rejected and the previous application is retained. */
export function setState(
  application: Application,
  state: unknown,
): { readonly ok: boolean; readonly application: Application } {
  if (!isApplicationState(state) || state === 'Outcome') return { ok: false, application };
  return { ok: true, application: { state, outcome: null } };
}

export interface LockerDocument {
  readonly id: string;
  readonly docType: string;
  readonly scanStatus: string;
  readonly deletedAt?: Date | string | null;
}

/** True when the document can take one more link (cap of 50 per document). */
export function canLink(_document: unknown, links: number | readonly unknown[]): boolean {
  const count = typeof links === 'number' ? links : links.length;
  return count < MAX_LINKS_PER_DOCUMENT;
}

/** Required document types with no non-deleted, clean document in the locker. */
export function missingDocuments(
  required: readonly string[],
  locker: readonly LockerDocument[],
): string[] {
  const present = new Set(
    locker.filter((d) => !d.deletedAt && d.scanStatus === 'clean').map((d) => d.docType),
  );
  return [...new Set(required)].filter((t) => !present.has(t));
}

/** Reminder kinds due now (at or past the 7- and 3-day points, before the deadline) and not yet sent. */
export function dueReminders(
  application: Application,
  deadline: Date,
  now: Date,
  sent: readonly ReminderKind[],
): ReminderKind[] {
  if (application.state === 'Submitted' || application.state === 'Outcome') return [];
  const remaining = deadline.getTime() - now.getTime();
  if (remaining <= 0) return [];
  return REMINDER_KINDS.filter(
    (k) => !sent.includes(k) && remaining <= REMINDER_OFFSET_DAYS[k] * DAY_MS,
  );
}
