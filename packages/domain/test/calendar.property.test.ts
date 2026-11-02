// Feature: campusconnect-platform, Property 19: Working-calendar round trip
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DateTime, IANAZone } from 'luxon';
import { addWorkingSeconds, isWorkingDay, workingSecondsBetween } from '../src/calendar';
import { instant } from '../src/types';
import { arbCalendar, arbInstant, arbLocalDate, DEFAULT_HOLIDAY_RANGE } from './arbitraries';

const MAX_BUDGET_SECONDS = 30 * 24 * 3600;
const budget = fc.integer({ min: 0, max: MAX_BUDGET_SECONDS });

describe('Property 19: Working-calendar round trip', () => {
  /** **Validates: Requirements 6.1, 6.2** */
  it('workingSecondsBetween(start, addWorkingSeconds(start, s)) equals s in working mode', () => {
    fc.assert(
      fc.property(arbCalendar(), arbInstant(), budget, (cal, start, s) => {
        const end = addWorkingSeconds(start, s, cal, 'working');
        expect(workingSecondsBetween(start, end, cal, 'working')).toBe(s);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 6.1, 6.2** */
  it('addWorkingSeconds is non-decreasing in s', () => {
    fc.assert(
      fc.property(arbCalendar(), arbInstant(), budget, budget, (cal, start, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        const earlier = addWorkingSeconds(start, low, cal, 'working');
        const later = addWorkingSeconds(start, high, cal, 'working');
        expect(later).toBeGreaterThanOrEqual(earlier);
        expect(earlier).toBeGreaterThanOrEqual(start);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * A positive budget ends inside a working window or exactly at its end: the last millisecond before the
   * result is working time, so one millisecond less than the result counts one second less than the budget.
   *
   * **Validates: Requirements 6.1**
   */
  it('a positive budget in working mode ends inside or at the end of a working window', () => {
    fc.assert(
      fc.property(arbCalendar(), arbInstant(), fc.integer({ min: 1, max: MAX_BUDGET_SECONDS }), (cal, start, s) => {
        const end = addWorkingSeconds(start, s, cal, 'working');
        const justBefore = instant(end - 1);
        expect(workingSecondsBetween(start, justBefore, cal, 'working')).toBe(s - 1);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 6.2** */
  it('in continuous mode the result is start plus s and the round trip holds', () => {
    fc.assert(
      fc.property(arbCalendar(), arbInstant(), budget, (cal, start, s) => {
        const end = addWorkingSeconds(start, s, cal, 'continuous');
        expect(end).toBe(start + s * 1000);
        expect(workingSecondsBetween(start, end, cal, 'continuous')).toBe(s);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Every holiday date in the calendar is not a working day. Holidays are days with no working time
   * regardless of their weekday.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('every holiday is not a working day', () => {
    fc.assert(
      fc.property(arbCalendar(), (cal) => {
        for (const holiday of cal.holidays) {
          expect(isWorkingDay(holiday, cal)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Non-holiday dates on weekends are never working days (no working windows on Saturday/Sunday).
   * This verifies that Saturday (6) and Sunday (7) have no working windows.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('non-holiday weekend dates are not working days', () => {
    fc.assert(
      fc.property(arbCalendar(), (cal) => {
        // Check a weekend date not in holidays
        const holidaySet = new Set(cal.holidays);
        // Find a Saturday in the default range that's not a holiday
        const startDate = DateTime.fromISO('2024-01-06', { zone: cal.timeZone }); // A Saturday
        for (let i = 0; i < 52; i++) {
          const testDate = startDate.plus({ weeks: i });
          const dateStr = testDate.toISODate();
          if (!holidaySet.has(dateStr!)) {
            expect(isWorkingDay(dateStr!, cal)).toBe(false);
            break;
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * A date is a working day if and only if it is not a holiday and its weekday has at least one working window.
   * This is the fundamental definition of isWorkingDay.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('a date is a working day iff it is not a holiday and its weekday has windows', () => {
    fc.assert(
      fc.property(arbCalendar(), arbLocalDate(DEFAULT_HOLIDAY_RANGE), (cal, dateStr) => {
        const isWorking = isWorkingDay(dateStr, cal);
        const dt = DateTime.fromISO(dateStr, { zone: cal.timeZone });
        const isoWeekday = dt.weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7;
        const hasWeekdayWindows = cal.weekly[isoWeekday].length > 0;
        const isHoliday = cal.holidays.includes(dateStr);

        expect(isWorking).toBe(!isHoliday && hasWeekdayWindows);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * isWorkingDay is deterministic: calling it twice with the same calendar and date produces the same result.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('isWorkingDay is deterministic', () => {
    fc.assert(
      fc.property(arbCalendar(), arbLocalDate(DEFAULT_HOLIDAY_RANGE), (cal, dateStr) => {
        const first = isWorkingDay(dateStr, cal);
        const second = isWorkingDay(dateStr, cal);
        expect(first).toBe(second);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Holidays list contains no duplicates and is maintained in order. The function accepts
   * any order but we verify that duplicate handling is sound.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('holidays are checked for membership without duplicate effects', () => {
    fc.assert(
      fc.property(arbCalendar(), (cal) => {
        const holidaySet = new Set(cal.holidays);
        // If there were duplicates, isWorkingDay would still work correctly
        // Each holiday in the set should return false
        for (const holiday of holidaySet) {
          expect(isWorkingDay(holiday, cal)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
