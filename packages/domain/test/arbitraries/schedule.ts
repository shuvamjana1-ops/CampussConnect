// fast-check arbitraries for @campusconnect/domain/schedule.
import fc from 'fast-check';
import type { Schedule } from '../../src/schedule';
import { arbTimeZone, TEST_TIME_ZONES } from './calendar';

/** `HH:mm` time format. */
export function arbTime(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 }),
    )
    .map(([hours, minutes]) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
}

/** ISO weekday 1 (Monday) to 7 (Sunday). */
export function arbWeekday(): fc.Arbitrary<1 | 2 | 3 | 4 | 5 | 6 | 7> {
  return fc.integer({ min: 1, max: 7 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5 | 6 | 7>;
}

/** Day of month 1-31. */
export function arbDayOfMonth(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 31 });
}

/**
 * Valid schedules: daily, weekly, monthly, quarterly, weekly_digest, and erp_24h.
 */
export function arbSchedule(): fc.Arbitrary<Schedule> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.record({ frequency: fc.constant('daily' as const), time: arbTime() }) },
    {
      weight: 1,
      arbitrary: fc.record({
        frequency: fc.constant('weekly' as const),
        weekday: arbWeekday(),
        time: arbTime(),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        frequency: fc.constant('monthly' as const),
        dayOfMonth: arbDayOfMonth(),
        time: arbTime(),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        frequency: fc.constant('quarterly' as const),
        dayOfMonth: arbDayOfMonth(),
        time: arbTime(),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        frequency: fc.constant('weekly_digest' as const),
        weekday: arbWeekday(),
        time: arbTime(),
      }),
    },
    { weight: 1, arbitrary: fc.constant({ frequency: 'erp_24h' as const }) },
  );
}
