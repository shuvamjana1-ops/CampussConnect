// @campusconnect/domain/sla: SLA clock, thresholds, escalation ladder and timer derivation.
import { DateTime } from 'luxon';
import { addWorkingSeconds, isWorkingDay, workingSecondsBetween, type ClockMode, type WorkingCalendar } from '../calendar';
import type { Instant } from '../types';

export interface SlaBudgets {
  readonly firstResponseSec: number;
  readonly resolutionSec: number;
  readonly l1Sec: number;
  readonly l2Sec: number;
}

/** A running interval. Gaps between segments are pauses, so paused time is never counted. */
export interface SlaSegment {
  readonly start: Instant;
  readonly end?: Instant;
}

export interface FirstResponse {
  readonly at: Instant;
  readonly elapsedSec: number;
  readonly met: boolean;
}

export type SlaClockState = 'running' | 'paused' | 'stopped';

export interface SlaClock {
  /** `continuous` for band P0 (6.2), otherwise `working`. */
  readonly mode: ClockMode;
  readonly budgets: SlaBudgets;
  /** Elapsed seconds before the last mode change. */
  readonly carriedSec: number;
  readonly segments: readonly SlaSegment[];
  readonly state: SlaClockState;
  readonly firstResponse?: FirstResponse;
}

/** The clock mode for a priority band: P0 runs continuously, every other band counts working time (6.1, 6.2). */
export function modeForBand(band: string): ClockMode {
  return band === 'P0' ? 'continuous' : 'working';
}

/** Starts a running clock at `now` with the given budgets and mode. */
export function startClock(now: Instant, budgets: SlaBudgets, mode: ClockMode): SlaClock {
  return { mode, budgets, carriedSec: 0, segments: [{ start: now }], state: 'running' };
}

/** A fresh clock for a dispute or reopen: every budget is 50% of the original (4.10, G16). */
export function freshClock(now: Instant, original: SlaBudgets, mode: ClockMode): SlaClock {
  return startClock(now, halveBudgets(original), mode);
}

export function halveBudgets(b: SlaBudgets): SlaBudgets {
  return {
    firstResponseSec: Math.floor(b.firstResponseSec / 2),
    resolutionSec: Math.floor(b.resolutionSec / 2),
    l1Sec: Math.floor(b.l1Sec / 2),
    l2Sec: Math.floor(b.l2Sec / 2),
  };
}

/** Elapsed SLA seconds: `carriedSec` plus the working (or continuous) time inside every segment (6.1). */
export function elapsedSec(c: SlaClock, cal: WorkingCalendar, now: Instant): number {
  let total = c.carriedSec;
  for (const segment of c.segments) {
    total += workingSecondsBetween(segment.start, segment.end ?? now, cal, c.mode);
  }
  return total;
}

/**
 * The instant at which elapsed time reaches `targetSec` if the clock keeps running from its current segment.
 * Undefined while the clock is paused or stopped.
 */
export function instantAtElapsed(c: SlaClock, cal: WorkingCalendar, targetSec: number): Instant | undefined {
  if (c.state !== 'running') {
    return undefined;
  }
  const target = Math.max(0, Math.ceil(targetSec));
  let counted = c.carriedSec;
  for (const segment of c.segments) {
    const needed = target - counted;
    if (segment.end === undefined) {
      return addWorkingSeconds(segment.start, Math.max(0, needed), cal, c.mode);
    }
    const length = workingSecondsBetween(segment.start, segment.end, cal, c.mode);
    if (length >= needed) {
      return addWorkingSeconds(segment.start, Math.max(0, needed), cal, c.mode);
    }
    counted += length;
  }
  return undefined;
}

/** Pause closes the current segment (4.4). Pausing a clock that is not running changes nothing. */
export function pauseClock(c: SlaClock, now: Instant): SlaClock {
  if (c.state !== 'running') {
    return c;
  }
  return { ...c, state: 'paused', segments: closeOpenSegment(c.segments, now) };
}

/** Resume opens a new segment (4.5). Resuming a clock that is not paused changes nothing. */
export function resumeClock(c: SlaClock, now: Instant): SlaClock {
  if (c.state !== 'paused') {
    return c;
  }
  return { ...c, state: 'running', segments: [...c.segments, { start: now }] };
}

/** Stops the clock for good, closing any open segment. */
export function stopClock(c: SlaClock, now: Instant): SlaClock {
  if (c.state === 'stopped') {
    return c;
  }
  return { ...c, state: 'stopped', segments: closeOpenSegment(c.segments, now) };
}

/**
 * A band change moves elapsed time into `carriedSec`, switches mode (P0 is continuous) and loads the new
 * budgets. A running clock continues in a new segment; a paused or stopped clock keeps its state (6.9).
 */
export function changeBand(
  c: SlaClock,
  cal: WorkingCalendar,
  now: Instant,
  newBand: string,
  budgets: SlaBudgets,
): SlaClock {
  const carriedSec = elapsedSec(c, cal, now);
  return {
    ...c,
    mode: modeForBand(newBand),
    budgets,
    carriedSec,
    segments: c.state === 'running' ? [{ start: now }] : [],
  };
}

/** Records the first public Handler message: `met = elapsedSec ≤ firstResponseSec` (6.8). Only the first counts. */
export function recordFirstResponse(c: SlaClock, cal: WorkingCalendar, now: Instant): SlaClock {
  if (c.firstResponse !== undefined) {
    return c;
  }
  const elapsed = elapsedSec(c, cal, now);
  return { ...c, firstResponse: { at: now, elapsedSec: elapsed, met: elapsed <= c.budgets.firstResponseSec } };
}

/** First-response time in whole minutes for reporting (6.8). */
export function firstResponseMinutes(r: FirstResponse): number {
  return Math.floor(r.elapsedSec / 60);
}

export type EscalationLevel = 0 | 1 | 2 | 3;

/** Share of the resolution budget at which a Ticket becomes At_Risk (6.3). */
export const AT_RISK_FRACTION = 0.75;
export const L3_REVIEW_WORKING_DAYS = 10;
export const AWAITING_STUDENT_MS = 7 * 86_400_000;
export const CONFIRMATION_WINDOW_MS = 7 * 86_400_000;
export const TRIAGE_DEADLINE_MS = 30_000;

export interface SlaThresholds {
  readonly atRiskSec: number;
  readonly l1Sec: number;
  readonly l2Sec: number;
  readonly l3Sec: number;
}

/** The At_Risk and L1 to L3 thresholds on the elapsed axis (6.3 to 6.6). */
export function thresholds(b: SlaBudgets): SlaThresholds {
  return {
    atRiskSec: AT_RISK_FRACTION * b.resolutionSec,
    l1Sec: b.resolutionSec,
    l2Sec: b.resolutionSec + b.l1Sec,
    l3Sec: b.resolutionSec + b.l1Sec + b.l2Sec,
  };
}

export function isAtRisk(c: SlaClock, cal: WorkingCalendar, now: Instant): boolean {
  return elapsedSec(c, cal, now) >= thresholds(c.budgets).atRiskSec;
}

export function isBreached(c: SlaClock, cal: WorkingCalendar, now: Instant): boolean {
  return elapsedSec(c, cal, now) >= c.budgets.resolutionSec;
}

/**
 * Number of L thresholds passed, never below `stored`, so the level never decreases while the Ticket is open.
 * A fresh clock after dispute or reopen starts again from `stored = 0`.
 */
export function escalationLevel(
  c: SlaClock,
  cal: WorkingCalendar,
  now: Instant,
  stored: EscalationLevel = 0,
): EscalationLevel {
  const elapsed = elapsedSec(c, cal, now);
  const t = thresholds(c.budgets);
  const computed = (elapsed >= t.l1Sec ? 1 : 0) + (elapsed >= t.l2Sec ? 1 : 0) + (elapsed >= t.l3Sec ? 1 : 0);
  return Math.max(stored, computed) as EscalationLevel;
}

export type TimerKind =
  | 'at_risk'
  | 'l1'
  | 'l2'
  | 'l3'
  | 'l3_review_due'
  | 'awaiting_student_7d'
  | 'confirmation_window_end'
  | 'triage_deadline';

export interface TimerRow {
  readonly kind: TimerKind;
  readonly dueAt: Instant;
}

/** The Ticket facts that timers depend on. Null means the event has not happened. */
export interface TimerTicket {
  /** When the Ticket was created and awaits triage (23.7). */
  readonly triageStartedAt: Instant | null;
  /** When the Ticket entered Resolved (Pending Confirmation). */
  readonly resolvedAt: Instant | null;
  /** When the Ticket began waiting on the Student. */
  readonly awaitingStudentSince: Instant | null;
  /** When the Ticket escalated to L3. */
  readonly l3EscalatedAt: Instant | null;
}

/**
 * The timer rows to upsert. Clock-based timers need a running clock; a paused or stopped clock produces no
 * row for them. Event-based timers are independent of the clock.
 */
export function deriveTimers(ticket: TimerTicket, clock: SlaClock, cal: WorkingCalendar): TimerRow[] {
  const rows: TimerRow[] = [];
  const t = thresholds(clock.budgets);
  const clockTimers: readonly [TimerKind, number][] = [
    ['at_risk', t.atRiskSec],
    ['l1', t.l1Sec],
    ['l2', t.l2Sec],
    ['l3', t.l3Sec],
  ];
  for (const [kind, sec] of clockTimers) {
    const dueAt = instantAtElapsed(clock, cal, sec);
    if (dueAt !== undefined) {
      rows.push({ kind, dueAt });
    }
  }
  if (ticket.l3EscalatedAt !== null) {
    rows.push({ kind: 'l3_review_due', dueAt: l3ReviewDeadline(ticket.l3EscalatedAt, cal) });
  }
  if (ticket.awaitingStudentSince !== null) {
    rows.push({ kind: 'awaiting_student_7d', dueAt: (ticket.awaitingStudentSince + AWAITING_STUDENT_MS) as Instant });
  }
  if (ticket.resolvedAt !== null) {
    rows.push({ kind: 'confirmation_window_end', dueAt: (ticket.resolvedAt + CONFIRMATION_WINDOW_MS) as Instant });
  }
  if (ticket.triageStartedAt !== null) {
    rows.push({ kind: 'triage_deadline', dueAt: (ticket.triageStartedAt + TRIAGE_DEADLINE_MS) as Instant });
  }
  return rows;
}

/** The 10 Working_Days after the escalation date (the escalation date itself is not counted), as local dates. */
function reviewDays(escalatedAt: Instant, cal: WorkingCalendar): string[] {
  const zone = cal.timeZone;
  let day = DateTime.fromMillis(escalatedAt, { zone }).startOf('day');
  const days: string[] = [];
  for (let guard = 0; days.length < L3_REVIEW_WORKING_DAYS && guard < 3660; guard += 1) {
    day = day.plus({ days: 1 });
    const iso = day.toISODate();
    if (iso !== null && isWorkingDay(iso, cal)) {
      days.push(iso);
    }
  }
  return days;
}

/** The end of the 10th Working_Day after the escalation date: the start of the next local day. */
export function l3ReviewDeadline(escalatedAt: Instant, cal: WorkingCalendar): Instant {
  const days = reviewDays(escalatedAt, cal);
  const last = days[days.length - 1] ?? DateTime.fromMillis(escalatedAt, { zone: cal.timeZone }).toISODate() ?? '';
  const end = DateTime.fromISO(last, { zone: cal.timeZone }).plus({ days: 1 }).startOf('day');
  return end.toMillis() as Instant;
}

/**
 * Working_Days `d` with `max(today, escalationDate + 1) ≤ d ≤ deadlineDate` (8.4). It is 10 on the escalation
 * day and 0 only once the deadline has passed.
 */
export function workingDaysRemaining(escalatedAt: Instant, now: Instant, cal: WorkingCalendar): number {
  const today = DateTime.fromMillis(now, { zone: cal.timeZone }).toISODate() ?? '';
  return reviewDays(escalatedAt, cal).filter((d) => d >= today).length;
}

function closeOpenSegment(segments: readonly SlaSegment[], now: Instant): SlaSegment[] {
  return segments.map((s) => (s.end === undefined ? { start: s.start, end: now } : s));
}
