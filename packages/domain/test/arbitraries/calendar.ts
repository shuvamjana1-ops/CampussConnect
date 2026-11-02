// fast-check arbitraries for @campusconnect/domain/calendar.
import fc from 'fast-check';
import type { WorkingCalendar, WorkingWindow } from '../../src/calendar';

const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;

/** Zones that observe DST in the default instant range, chosen for awkward transition rules. */
export const DST_TIME_ZONES = [
  'America/New_York', // clocks change at 02:00 local
  'Europe/London', // clocks change at 01:00 UTC
  'Europe/Berlin',
  'Australia/Sydney', // southern hemisphere: DST spans the new year
  'Australia/Lord_Howe', // 30-minute DST shift
  'America/St_Johns', // UTC-03:30 with DST
  'Pacific/Chatham', // UTC+12:45 with DST, clocks change at 02:45 local
  'America/Santiago', // clocks change at local midnight
  'America/Havana', // clocks change at local midnight
] as const;

/** Every zone the calendar arbitraries draw from by default. */
export const TEST_TIME_ZONES = [
  'Asia/Kolkata', // default for India Tenants, no DST
  'UTC',
  'Asia/Kathmandu', // UTC+05:45, no DST
  'Asia/Tehran', // UTC+03:30, DST abolished after 2022
  'Africa/Casablanca', // offset changes around Ramadan
  'Pacific/Apia', // DST abolished after 2021
  ...DST_TIME_ZONES,
] as const;

/** Shortest generated window. It keeps sparse calendars from needing decades of walking for month-long budgets. */
export const DEFAULT_MIN_WINDOW_MINUTES = 30;

export interface LocalDateRange {
  /** Inclusive first date, `yyyy-MM-dd`. */
  readonly from: string;
  /** Inclusive last date, `yyyy-MM-dd`. */
  readonly to: string;
}

/** Holidays default to dates around the default instant range of `arbInstant`. */
export const DEFAULT_HOLIDAY_RANGE: LocalDateRange = { from: '2017-12-01', to: '2034-12-31' };

export interface CalendarArbitraryOptions {
  readonly timeZones?: readonly string[];
  readonly holidayRange?: LocalDateRange;
  readonly maxHolidays?: number;
  readonly minWindowMinutes?: number;
}

/** The default Tenant calendar shape: Monday to Friday, 09:00 to 17:00. */
const OFFICE_HOURS: WorkingCalendar['weekly'] = {
  1: [{ start: '09:00', end: '17:00' }],
  2: [{ start: '09:00', end: '17:00' }],
  3: [{ start: '09:00', end: '17:00' }],
  4: [{ start: '09:00', end: '17:00' }],
  5: [{ start: '09:00', end: '17:00' }],
  6: [],
  7: [],
};

const NO_WINDOWS: WorkingCalendar['weekly'] = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

export function arbTimeZone(zones: readonly string[] = TEST_TIME_ZONES): fc.Arbitrary<string> {
  return fc.constantFrom(...zones);
}

/** `HH:mm` for a minute of the day; minute 1440 is `24:00`. */
function clockTime(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const minutes = String(minuteOfDay % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * A window of at least `minMinutes`, possibly ending at `24:00`. One start in four falls between 00:00 and
 * 04:00, where DST transitions happen, so windows often begin or end inside a skipped or repeated hour.
 */
export function arbWorkingWindow(minMinutes = DEFAULT_MIN_WINDOW_MINUTES): fc.Arbitrary<WorkingWindow> {
  const latestStart = MINUTES_PER_DAY - minMinutes;
  const start = fc.oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0, max: latestStart }) },
    { weight: 1, arbitrary: fc.integer({ min: 0, max: Math.min(240, latestStart) }) },
  );
  return start.chain((startMinute) =>
    fc
      .integer({ min: startMinute + minMinutes, max: MINUTES_PER_DAY })
      .map((endMinute) => ({ start: clockTime(startMinute), end: clockTime(endMinute) })),
  );
}

/** Zero to three windows per weekday, which may overlap, with at least one window in the week. */
function arbWeekly(minMinutes: number): fc.Arbitrary<WorkingCalendar['weekly']> {
  const day = fc.array(arbWorkingWindow(minMinutes), { maxLength: 3 });
  return fc
    .record({ 1: day, 2: day, 3: day, 4: day, 5: day, 6: day, 7: day })
    .filter((weekly) => Object.values(weekly).some((windows) => windows.length > 0));
}

export function arbLocalDate(range: LocalDateRange = DEFAULT_HOLIDAY_RANGE): fc.Arbitrary<string> {
  return fc
    .integer({ min: Date.parse(range.from) / DAY_MS, max: Date.parse(range.to) / DAY_MS })
    .map((epochDay) => new Date(epochDay * DAY_MS).toISOString().slice(0, 10));
}

export function arbHolidays(range: LocalDateRange = DEFAULT_HOLIDAY_RANGE, maxLength = 40): fc.Arbitrary<string[]> {
  return fc.uniqueArray(arbLocalDate(range), { maxLength });
}

/**
 * Valid working calendars: a zone from `TEST_TIME_ZONES` (including DST zones), random windows (or the
 * default office hours one time in five) and random holidays. Every calendar has some working time.
 */
export function arbCalendar(options: CalendarArbitraryOptions = {}): fc.Arbitrary<WorkingCalendar> {
  const {
    timeZones = TEST_TIME_ZONES,
    holidayRange = DEFAULT_HOLIDAY_RANGE,
    maxHolidays = 40,
    minWindowMinutes = DEFAULT_MIN_WINDOW_MINUTES,
  } = options;
  return fc.record({
    timeZone: arbTimeZone(timeZones),
    weekly: fc.oneof(
      { weight: 4, arbitrary: arbWeekly(minWindowMinutes) },
      { weight: 1, arbitrary: fc.constant(OFFICE_HOURS) },
    ),
    holidays: arbHolidays(holidayRange, maxHolidays),
  });
}

/** Calendars with no working window on any weekday, which raise `CalendarHasNoWorkingTime`. */
export function arbCalendarWithoutWorkingTime(options: CalendarArbitraryOptions = {}): fc.Arbitrary<WorkingCalendar> {
  const { timeZones = TEST_TIME_ZONES, holidayRange = DEFAULT_HOLIDAY_RANGE, maxHolidays = 40 } = options;
  return fc.record({
    timeZone: arbTimeZone(timeZones),
    weekly: fc.constant(NO_WINDOWS),
    holidays: arbHolidays(holidayRange, maxHolidays),
  });
}
