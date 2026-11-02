// @campusconnect/domain/calendar: working calendar and working-time arithmetic.
import { DateTime, IANAZone } from 'luxon';
import { instant, type Instant } from '../types';
import { DAY_MS, MINUTE_MS, firstInstantAtOrAfter, isoDateOf, isoWeekdayOf, localDayOf } from './local-time';

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A working window within one local day. `start` and `end` are local `HH:mm` times with `start` before `end`;
 * `end` may be `24:00` for a window that runs to midnight. Overlapping windows on the same day are merged.
 */
export interface WorkingWindow {
  readonly start: string;
  readonly end: string;
}

export interface WorkingCalendar {
  /** IANA time zone in which windows and holidays are read, e.g. `Asia/Kolkata`. */
  readonly timeZone: string;
  /** Working windows for each ISO weekday (1 = Monday … 7 = Sunday). */
  readonly weekly: Readonly<Record<IsoWeekday, readonly WorkingWindow[]>>;
  /** Local `yyyy-MM-dd` dates with no working time. */
  readonly holidays: readonly string[];
}

/** `working` counts only time inside working windows; `continuous` counts all time (band P0, 6.2). */
export type ClockMode = 'working' | 'continuous';

/**
 * The calendar has no working window on any weekday, so no working time can ever be counted.
 * The SLA engine treats this like a missing calendar (6.12).
 */
export class CalendarHasNoWorkingTime extends Error {
  constructor() {
    super('The working calendar has no working windows, so working time cannot be counted.');
    this.name = 'CalendarHasNoWorkingTime';
  }
}

const MS_PER_SECOND = 1000;
const MINUTES_PER_DAY = 1440;
const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** [start, end) minutes of the local day. */
type MinuteWindow = readonly [start: number, end: number];

interface CompiledCalendar {
  readonly zone: IANAZone;
  /** Sorted, merged windows for each ISO weekday. */
  readonly weekly: Readonly<Record<IsoWeekday, readonly MinuteWindow[]>>;
  readonly holidays: ReadonlySet<string>;
  readonly hasWorkingTime: boolean;
  /**
   * How many consecutive days without working time a search may walk before giving up. A weekday with
   * windows recurs every 7 days and is lost only to a holiday or to a window that falls entirely inside
   * a skipped DST hour, so this bound is never reached while working time remains.
   */
  readonly maxIdleDays: number;
}

/**
 * The instant at which `seconds` of clock time have elapsed after `start`.
 *
 * In `working` mode only time inside working windows on non-holiday dates counts, read in the calendar's
 * time zone with DST applied. A positive budget ends inside a working window or exactly at its end.
 * A budget of 0 returns `start`. In `continuous` mode the result is `start + seconds`.
 *
 * @throws CalendarHasNoWorkingTime if the calendar has no working windows (in both modes, 6.12 and G8).
 * @throws RangeError if `seconds` is not a non-negative whole number or the calendar is malformed.
 */
export function addWorkingSeconds(start: Instant, seconds: number, cal: WorkingCalendar, mode: ClockMode): Instant {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError('seconds must be a whole number of seconds, zero or more.');
  }
  const calendar = compileWithWorkingTime(cal);
  const startMs: number = start;
  if (mode === 'continuous') {
    return instant(startMs + seconds * MS_PER_SECOND);
  }
  let remaining = seconds * MS_PER_SECOND;
  if (remaining === 0) {
    return start;
  }
  let cursor = startMs;
  let idleDays = 0;
  // Start one local day early so that no window that contains `start` is missed around a DST change.
  for (let day = localDayOf(calendar.zone, startMs) - DAY_MS; ; day += DAY_MS) {
    let progressed = false;
    for (const [windowStart, windowEnd] of workingIntervals(calendar, day)) {
      const from = Math.max(windowStart, cursor);
      if (windowEnd <= from) {
        continue;
      }
      const available = windowEnd - from;
      if (available >= remaining) {
        return instant(from + remaining);
      }
      remaining -= available;
      cursor = windowEnd;
      progressed = true;
    }
    idleDays = progressed ? 0 : idleDays + 1;
    if (idleDays > calendar.maxIdleDays) {
      throw new CalendarHasNoWorkingTime();
    }
  }
}

/**
 * Whole seconds of clock time between `a` and `b`, rounded down; 0 when `b` is not after `a`.
 * `working` mode counts only time inside working windows on non-holiday dates; `continuous` mode counts all of it.
 *
 * @throws CalendarHasNoWorkingTime if the calendar has no working windows (in both modes, 6.12 and G8).
 * @throws RangeError if the calendar is malformed.
 */
export function workingSecondsBetween(a: Instant, b: Instant, cal: WorkingCalendar, mode: ClockMode): number {
  const calendar = compileWithWorkingTime(cal);
  const from: number = a;
  const to: number = b;
  if (to <= from) {
    return 0;
  }
  if (mode === 'continuous') {
    return Math.floor((to - from) / MS_PER_SECOND);
  }
  let totalMs = 0;
  const lastDay = localDayOf(calendar.zone, to) + DAY_MS;
  for (let day = localDayOf(calendar.zone, from) - DAY_MS; day <= lastDay; day += DAY_MS) {
    for (const [windowStart, windowEnd] of workingIntervals(calendar, day)) {
      const overlapStart = Math.max(windowStart, from);
      const overlapEnd = Math.min(windowEnd, to);
      if (overlapEnd > overlapStart) {
        totalMs += overlapEnd - overlapStart;
      }
    }
  }
  return Math.floor(totalMs / MS_PER_SECOND);
}

/**
 * Whether a local `yyyy-MM-dd` date is a Working_Day: its weekday has at least one working window and it is
 * not a holiday. A calendar with no working windows has no Working_Days.
 *
 * @throws RangeError if `localDate` is not a valid `yyyy-MM-dd` date or the calendar is malformed.
 */
export function isWorkingDay(localDate: string, cal: WorkingCalendar): boolean {
  const day = parseLocalDate(localDate, 'localDate');
  const calendar = compile(cal);
  return !calendar.holidays.has(localDate) && calendar.weekly[isoWeekdayOf(day)].length > 0;
}

/** Working windows of one local day (a wall value at local midnight) as instants; none on a holiday. */
function workingIntervals(calendar: CompiledCalendar, day: number): (readonly [number, number])[] {
  if (calendar.holidays.has(isoDateOf(day))) {
    return [];
  }
  return calendar.weekly[isoWeekdayOf(day)].map(
    ([start, end]) =>
      [
        firstInstantAtOrAfter(calendar.zone, day + start * MINUTE_MS),
        firstInstantAtOrAfter(calendar.zone, day + end * MINUTE_MS),
      ] as const,
  );
}

function compileWithWorkingTime(cal: WorkingCalendar): CompiledCalendar {
  const calendar = compile(cal);
  if (!calendar.hasWorkingTime) {
    throw new CalendarHasNoWorkingTime();
  }
  return calendar;
}

function compile(cal: WorkingCalendar): CompiledCalendar {
  if (!IANAZone.isValidZone(cal.timeZone)) {
    throw new RangeError('timeZone must be a known IANA time zone.');
  }
  const weekly: Record<IsoWeekday, readonly MinuteWindow[]> = {
    1: mergedWindows(cal, 1),
    2: mergedWindows(cal, 2),
    3: mergedWindows(cal, 3),
    4: mergedWindows(cal, 4),
    5: mergedWindows(cal, 5),
    6: mergedWindows(cal, 6),
    7: mergedWindows(cal, 7),
  };
  const holidays = new Set<string>();
  for (const holiday of cal.holidays) {
    parseLocalDate(holiday, 'holidays');
    holidays.add(holiday);
  }
  return {
    zone: IANAZone.create(cal.timeZone),
    weekly,
    holidays,
    hasWorkingTime: Object.values(weekly).some((windows) => windows.length > 0),
    maxIdleDays: 7 * (holidays.size + 4),
  };
}

function mergedWindows(cal: WorkingCalendar, weekday: IsoWeekday): MinuteWindow[] {
  const parsed = cal.weekly[weekday].map((entry): MinuteWindow => {
    const start = parseClockTime(entry.start, false);
    const end = parseClockTime(entry.end, true);
    if (start === undefined || end === undefined || start >= end) {
      throw new RangeError(`weekly.${String(weekday)} windows need HH:mm start and end times with start before end.`);
    }
    return [start, end];
  });
  parsed.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of parsed) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Minutes since local midnight for `HH:mm`; `24:00` is accepted only as an end time. */
function parseClockTime(text: string, allowEndOfDay: boolean): number | undefined {
  if (allowEndOfDay && text === '24:00') {
    return MINUTES_PER_DAY;
  }
  const match = CLOCK_TIME.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, hours = '', minutes = ''] = match;
  return Number(hours) * 60 + Number(minutes);
}

/** Midnight of a `yyyy-MM-dd` date as a wall value. */
function parseLocalDate(text: string, field: string): number {
  if (LOCAL_DATE.test(text)) {
    const date = DateTime.fromISO(text, { zone: 'utc' });
    if (date.isValid) {
      return date.toMillis();
    }
  }
  throw new RangeError(`${field} must contain valid yyyy-MM-dd dates.`);
}
