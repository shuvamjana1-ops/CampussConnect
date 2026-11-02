// @campusconnect/domain/schedule: recurring schedule calculation.
import { DateTime, IANAZone } from 'luxon';
import { type Instant, instant } from '../types';

/**
 * Frequency of a recurring schedule: daily, weekly, monthly or quarterly reports, weekly digest,
 * or 24-hour ERP sync.
 */
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'weekly_digest' | 'erp_24h';

/**
 * A recurring schedule configuration. Each frequency has its own shape:
 * - `daily`: runs every day at the configured time
 * - `weekly`: runs every week on the configured weekday at the configured time
 * - `monthly`: runs every month on the configured day of month at the configured time
 * - `quarterly`: runs every quarter on the configured day of month at the configured time
 * - `weekly_digest`: runs once per 7-day period at the configured weekday and time
 * - `erp_24h`: runs every 24 hours (at the configured time if provided)
 */
export type Schedule =
  | { readonly frequency: 'daily'; readonly time: string }
  | { readonly frequency: 'weekly'; readonly weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly time: string }
  | { readonly frequency: 'monthly'; readonly dayOfMonth: number; readonly time: string }
  | { readonly frequency: 'quarterly'; readonly dayOfMonth: number; readonly time: string }
  | { readonly frequency: 'weekly_digest'; readonly weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly time: string }
  | { readonly frequency: 'erp_24h' };

/**
 * The next occurrence of a schedule after a given instant, in the specified time zone.
 *
 * For all schedules, `nextRunAt` returns an instant strictly after `after`, matching the schedule
 * in local time, such that no valid run time exists between `after` and the result.
 *
 * For `erp_24h`, the gap between consecutive scheduled runs never exceeds 24 hours.
 *
 * DST transitions are handled correctly: when a scheduled time falls in a skipped hour (spring forward),
 * the run is moved forward by the DST offset; when it falls in a repeated hour (fall back), the first
 * occurrence is used.
 *
 * @param schedule The recurring schedule configuration
 * @param after The reference instant; the result is strictly after this
 * @param timeZone IANA time zone name (e.g., 'Asia/Kolkata', 'UTC')
 * @returns The next occurrence of the schedule
 * @throws RangeError if the time zone is invalid, the time format is invalid, or the schedule is malformed
 */
export function nextRunAt(schedule: Schedule, after: Instant, timeZone: string): Instant {
  if (!IANAZone.isValidZone(timeZone)) {
    throw new RangeError('timeZone must be a known IANA time zone.');
  }

  const zone = IANAZone.create(timeZone);
  const afterDt = DateTime.fromMillis(Number(after), { zone });

  if (!afterDt.isValid) {
    throw new RangeError('after must be a valid instant.');
  }

  switch (schedule.frequency) {
    case 'daily':
      return dailyNextRun(afterDt, schedule.time, zone);

    case 'weekly':
      return weeklyNextRun(afterDt, schedule.weekday, schedule.time, zone);

    case 'monthly':
      return monthlyNextRun(afterDt, schedule.dayOfMonth, schedule.time, zone);

    case 'quarterly':
      return quarterlyNextRun(afterDt, schedule.dayOfMonth, schedule.time, zone);

    case 'weekly_digest':
      return weeklyDigestNextRun(afterDt, schedule.weekday, schedule.time, zone);

    case 'erp_24h':
      return erp24hNextRun(afterDt, zone);

    default:
      const _exhaustive: never = schedule;
      return _exhaustive;
  }
}

/**
 * Parse a `HH:mm` time string and validate it.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new RangeError('time must be in HH:mm format with hours 00-23 and minutes 00-59.');
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return { hours, minutes };
}

/**
 * Create a DateTime for a given time on a given local date, handling DST:
 * - If the time is valid, return it
 * - If the time falls in a skipped hour (spring forward), return the time after the skip
 * - If the time falls in a repeated hour (fall back), return the first occurrence
 */
function setLocalTime(dt: DateTime, hours: number, minutes: number, zone: IANAZone): DateTime {
  // Use the provided DateTime's date components
  const year = dt.year;
  const month = dt.month;
  const day = dt.day;

  // Try to create a local datetime with the specified time
  let result = DateTime.local(year, month, day, hours, minutes, 0, 0, { zone });

  // Check if this time is valid. If it's ambiguous or outside working time due to DST,
  // Luxon will choose one. We need to verify and potentially adjust.
  
  // The approach: if the hour doesn't match after construction, it means the local time was invalid/skipped.
  // In that case, we move forward to the next valid time.
  if (!result.isValid) {
    // This shouldn't happen with properly validated inputs, but handle it
    throw new RangeError(`Cannot create valid datetime for ${year}-${month}-${day} ${hours}:${minutes} in ${zone.name}`);
  }

  // Check if the resulting instant is actually at the time we requested.
  // This is the key: if the offset changed due to DST, the hour might differ.
  const checkResult = DateTime.fromMillis(result.toMillis(), { zone });
  
  if (checkResult.hour !== hours || checkResult.minute !== minutes) {
    // The time we asked for doesn't exist (it was skipped by DST forward).
    // Move forward by one hour.
    result = DateTime.local(year, month, day, hours + 1, minutes, 0, 0, { zone });
    
    // Check again after moving forward
    const checkAgain = DateTime.fromMillis(result.toMillis(), { zone });
    if (checkAgain.hour !== hours + 1 || checkAgain.minute !== minutes) {
      // If still wrong, move to the next day
      result = DateTime.local(year, month, day + 1, hours, minutes, 0, 0, { zone });
    }
  }

  return result;
}

/**
 * Daily schedule: next run is at the specified time on the next day (or today if that time hasn't passed).
 */
function dailyNextRun(afterDt: DateTime, time: string, zone: IANAZone): Instant {
  const { hours, minutes } = parseTime(time);

  // Try today
  let candidate = setLocalTime(afterDt, hours, minutes, zone);

  if (candidate.toMillis() > afterDt.toMillis()) {
    return instant(candidate.toMillis());
  }

  // Try tomorrow
  candidate = setLocalTime(afterDt.plus({ day: 1 }), hours, minutes, zone);
  return instant(candidate.toMillis());
}

/**
 * Weekly schedule: next run is at the specified time on the specified weekday.
 */
function weeklyNextRun(
  afterDt: DateTime,
  targetWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  time: string,
  zone: IANAZone,
): Instant {
  const { hours, minutes } = parseTime(time);

  // Calculate how many days until the target weekday
  const daysUntilTarget = (targetWeekday - afterDt.weekday + 7) % 7;
  
  // Start from either today (if we haven't passed the time) or tomorrow
  let daysToAdd = daysUntilTarget;
  
  // Try the target weekday
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = setLocalTime(afterDt.plus({ day: daysToAdd }), hours, minutes, zone);
    
    if (candidate.toMillis() > afterDt.toMillis()) {
      return instant(candidate.toMillis());
    }
    
    // If that didn't work, try next week
    daysToAdd += 7;
  }

  // Shouldn't reach here
  throw new Error('Failed to find next weekly occurrence');
}

/**
 * Monthly schedule: next run is at the specified time on the specified day of the month.
 * If the day doesn't exist in a month (e.g., Feb 30), use the last day of that month.
 */
function monthlyNextRun(
  afterDt: DateTime,
  dayOfMonth: number,
  time: string,
  zone: IANAZone,
): Instant {
  if (dayOfMonth < 1 || dayOfMonth > 31) {
    throw new RangeError('dayOfMonth must be between 1 and 31.');
  }

  const { hours, minutes } = parseTime(time);

  let year = afterDt.year;
  let month = afterDt.month;

  // Check the next 13 months to ensure we find the right occurrence
  for (let i = 0; i < 13; i++) {
    // Get the number of days in this month
    const daysInMonth = DateTime.local(year, month, 1, { zone }).daysInMonth || 28;
    const targetDay = Math.min(dayOfMonth, daysInMonth);

    // Create the candidate datetime
    const candidate = setLocalTime(DateTime.local(year, month, targetDay, { zone }), hours, minutes, zone);

    if (candidate.toMillis() > afterDt.toMillis()) {
      return instant(candidate.toMillis());
    }

    // Move to the next month
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  // Shouldn't reach here
  throw new Error('Failed to find next monthly occurrence');
}

/**
 * Quarterly schedule: next run is at the specified time on the specified day of the first month
 * of each quarter. Quarters are: Jan-Mar (month 1), Apr-Jun (month 4), Jul-Sep (month 7), Oct-Dec (month 10).
 */
function quarterlyNextRun(
  afterDt: DateTime,
  dayOfMonth: number,
  time: string,
  zone: IANAZone,
): Instant {
  if (dayOfMonth < 1 || dayOfMonth > 31) {
    throw new RangeError('dayOfMonth must be between 1 and 31.');
  }

  const { hours, minutes } = parseTime(time);

  const quarterStarts = [1, 4, 7, 10];
  let year = afterDt.year;
  
  // Find which quarter month to start with
  let quarterIdx = quarterStarts.findIndex((q) => q >= afterDt.month);
  
  // If no quarter found in current year, start from Q1 next year
  if (quarterIdx === -1) {
    quarterIdx = 0;
    year += 1;
  }

  // Check the next 16 quarters (4 years) to find the next one
  for (let i = 0; i < 16; i++) {
    const month = quarterStarts[quarterIdx];
    
    // Get the number of days in the quarter start month
    const daysInMonth = DateTime.local(year, month, 1, { zone }).daysInMonth || 28;
    const targetDay = Math.min(dayOfMonth, daysInMonth);

    // Create the candidate datetime
    const candidate = setLocalTime(DateTime.local(year, month, targetDay, { zone }), hours, minutes, zone);

    if (candidate.toMillis() > afterDt.toMillis()) {
      return instant(candidate.toMillis());
    }

    // Move to next quarter
    quarterIdx += 1;
    if (quarterIdx >= quarterStarts.length) {
      quarterIdx = 0;
      year += 1;
    }
  }

  // Shouldn't reach here
  throw new Error('Failed to find next quarterly occurrence');
}

/**
 * Weekly digest schedule: same as weekly, but the semantics are slightly different.
 * It runs once per 7-day period, meaning if one was delivered 5 days ago, the next one
 * is 2 days away. For simplicity, we treat it as a weekly occurrence on the specified weekday.
 */
function weeklyDigestNextRun(
  afterDt: DateTime,
  targetWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  time: string,
  zone: IANAZone,
): Instant {
  // Same logic as weekly: find the next occurrence of the target weekday at the specified time
  return weeklyNextRun(afterDt, targetWeekday, time, zone);
}

/**
 * ERP 24-hour sync: next run is 24 hours after the given instant.
 * This ensures the gap between consecutive runs never exceeds 24 hours.
 */
function erp24hNextRun(afterDt: DateTime, _zone: IANAZone): Instant {
  return instant(afterDt.toMillis() + 24 * 60 * 60 * 1000);
}
