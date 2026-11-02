// Conversions between instants and local wall-clock time in an IANA time zone, using Luxon's zone data.
//
// A "wall" value is a local date and time encoded as milliseconds since 1970-01-01T00:00 *local*,
// so ordinary arithmetic on it moves along the local calendar (one local day is always DAY_MS).
import type { IANAZone } from 'luxon';

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** The zone's UTC offset at instant `t`, in milliseconds (local wall clock minus UTC). */
function offsetAt(zone: IANAZone, t: number): number {
  // Luxon reports minutes, which are fractional for historical offsets such as +05:53:28.
  return Math.round(zone.offset(t) * MINUTE_MS);
}

/** Local midnight, as a wall value, of the local date that contains instant `t`. */
export function localDayOf(zone: IANAZone, t: number): number {
  const wall = t + offsetAt(zone, t);
  return wall - mod(wall, DAY_MS);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a local day given as a wall value. 1970-01-01 was a Thursday. */
export function isoWeekdayOf(day: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return (mod(Math.floor(day / DAY_MS) + 3, 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** `yyyy-MM-dd` of a local day given as a wall value. */
export function isoDateOf(day: number): string {
  return new Date(day).toISOString().slice(0, 10);
}

/**
 * The first instant at which the local clock in `zone` shows `wall` or a later time.
 *
 * - An ordinary local time maps to its only instant.
 * - A repeated local time (clocks go back) maps to its first occurrence.
 * - A skipped local time (clocks go forward) maps to the transition instant, the first moment the clock
 *   shows a later time.
 *
 * The mapping never decreases as `wall` increases, so windows built from it stay ordered and disjoint.
 * Luxon's `DateTime.fromObject` is not used for this: it resolves repeated times with the offset in
 * force at the current system time, which would make results depend on when the code runs.
 */
export function firstInstantAtOrAfter(zone: IANAZone, wall: number): number {
  // Offsets on either side of any transition near `wall` (the same approach as the Temporal polyfill).
  const before = offsetAt(zone, wall - DAY_MS);
  const after = offsetAt(zone, wall + DAY_MS);
  const withBefore = wall - before;
  const withAfter = wall - after;
  const beforeFits = offsetAt(zone, withBefore) === before;
  const afterFits = offsetAt(zone, withAfter) === after;
  if (beforeFits && afterFits) {
    return Math.min(withBefore, withAfter);
  }
  if (beforeFits) {
    return withBefore;
  }
  if (afterFits) {
    return withAfter;
  }
  return transitionInstant(zone, Math.min(withBefore, withAfter), Math.max(withBefore, withAfter));
}

/** The first instant in `(low, high]` whose offset differs from the offset at `low`, found by bisection. */
function transitionInstant(zone: IANAZone, low: number, high: number): number {
  const lowOffset = offsetAt(zone, low);
  if (offsetAt(zone, high) === lowOffset) {
    return high;
  }
  let lo = low;
  let hi = high;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (offsetAt(zone, mid) === lowOffset) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}
