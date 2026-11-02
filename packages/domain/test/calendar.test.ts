import fc from 'fast-check';
import { IANAZone } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  CalendarHasNoWorkingTime,
  addWorkingSeconds,
  isWorkingDay,
  workingSecondsBetween,
  type WorkingCalendar,
  type WorkingWindow,
} from '../src/calendar';
import { instant, type Instant } from '../src/types';
import { DST_TIME_ZONES, TEST_TIME_ZONES, arbCalendar, arbCalendarWithoutWorkingTime } from './arbitraries';

const HOUR = 3600;

/** An instant from an ISO-8601 string with an explicit offset. */
function at(iso: string): Instant {
  return instant(Date.parse(iso));
}

function everyDay(window: WorkingWindow, timeZone: string): WorkingCalendar {
  return {
    timeZone,
    weekly: { 1: [window], 2: [window], 3: [window], 4: [window], 5: [window], 6: [window], 7: [window] },
    holidays: [],
  };
}

/** The default Tenant calendar: Monday to Friday, 09:00 to 17:00. */
function officeHours(timeZone = 'Asia/Kolkata', holidays: string[] = []): WorkingCalendar {
  const day = [{ start: '09:00', end: '17:00' }];
  return { timeZone, weekly: { 1: day, 2: day, 3: day, 4: day, 5: day, 6: [], 7: [] }, holidays };
}

const noWorkingTime: WorkingCalendar = {
  timeZone: 'Asia/Kolkata',
  weekly: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
  holidays: [],
};

// 2026-03-06 is a Friday.
const friday1600 = at('2026-03-06T16:00:00+05:30');

describe('addWorkingSeconds in working mode', () => {
  const cal = officeHours();

  it('counts only working hours, skipping the weekend', () => {
    expect(addWorkingSeconds(friday1600, 2 * HOUR, cal, 'working')).toBe(at('2026-03-09T10:00:00+05:30'));
  });

  it('ends at the end of a window when the budget runs out exactly there', () => {
    expect(addWorkingSeconds(friday1600, HOUR, cal, 'working')).toBe(at('2026-03-06T17:00:00+05:30'));
  });

  it('starts counting at the next window when the start is outside working hours', () => {
    expect(addWorkingSeconds(at('2026-03-07T12:00:00+05:30'), 1800, cal, 'working')).toBe(
      at('2026-03-09T09:30:00+05:30'),
    );
    expect(addWorkingSeconds(at('2026-03-09T07:00:00+05:30'), HOUR, cal, 'working')).toBe(
      at('2026-03-09T10:00:00+05:30'),
    );
  });

  it('returns the start unchanged for a zero budget, even outside working hours', () => {
    const saturday = at('2026-03-07T12:00:00+05:30');
    expect(addWorkingSeconds(saturday, 0, cal, 'working')).toBe(saturday);
  });

  it('skips holidays', () => {
    const withHoliday = officeHours('Asia/Kolkata', ['2026-03-09']);
    expect(addWorkingSeconds(friday1600, 2 * HOUR, withHoliday, 'working')).toBe(at('2026-03-10T10:00:00+05:30'));
  });

  it('spends a P1 resolution budget of 960 working minutes over two Working_Days', () => {
    expect(addWorkingSeconds(at('2026-03-09T09:00:00+05:30'), 960 * 60, cal, 'working')).toBe(
      at('2026-03-10T17:00:00+05:30'),
    );
  });

  it('keeps millisecond precision and round-trips with workingSecondsBetween', () => {
    const start = at('2026-03-09T10:15:30.250+05:30');
    const end = addWorkingSeconds(start, 8 * HOUR, cal, 'working');
    expect(end).toBe(at('2026-03-10T10:15:30.250+05:30'));
    expect(workingSecondsBetween(start, end, cal, 'working')).toBe(8 * HOUR);
  });

  it('merges overlapping windows on the same day', () => {
    const overlapping: WorkingCalendar = {
      ...noWorkingTime,
      weekly: { ...noWorkingTime.weekly, 1: [{ start: '11:00', end: '13:00' }, { start: '09:00', end: '12:00' }] },
    };
    const monday = at('2026-03-09T00:00:00+05:30');
    expect(workingSecondsBetween(monday, at('2026-03-10T00:00:00+05:30'), overlapping, 'working')).toBe(4 * HOUR);
    expect(addWorkingSeconds(monday, 4 * HOUR, overlapping, 'working')).toBe(at('2026-03-09T13:00:00+05:30'));
  });

  it('accepts 24:00 as the end of a window that runs to midnight', () => {
    const lateShift: WorkingCalendar = {
      ...noWorkingTime,
      weekly: { ...noWorkingTime.weekly, 1: [{ start: '22:00', end: '24:00' }] },
    };
    expect(addWorkingSeconds(at('2026-03-09T23:00:00+05:30'), HOUR, lateShift, 'working')).toBe(
      at('2026-03-10T00:00:00+05:30'),
    );
  });
});

describe('workingSecondsBetween in working mode', () => {
  const cal = officeHours();

  it('counts working seconds across a weekend', () => {
    expect(workingSecondsBetween(friday1600, at('2026-03-09T10:00:00+05:30'), cal, 'working')).toBe(2 * HOUR);
  });

  it('is 0 when the end is not after the start', () => {
    const monday = at('2026-03-09T10:00:00+05:30');
    expect(workingSecondsBetween(monday, friday1600, cal, 'working')).toBe(0);
    expect(workingSecondsBetween(monday, monday, cal, 'working')).toBe(0);
  });

  it('is 0 across a weekend with no working time', () => {
    expect(
      workingSecondsBetween(at('2026-03-07T00:00:00+05:30'), at('2026-03-09T00:00:00+05:30'), cal, 'working'),
    ).toBe(0);
  });

  it('rounds down to whole seconds', () => {
    expect(
      workingSecondsBetween(at('2026-03-09T09:00:00.000+05:30'), at('2026-03-09T09:00:01.999+05:30'), cal, 'working'),
    ).toBe(1);
  });
});

describe('continuous mode', () => {
  const cal = officeHours('Asia/Kolkata', ['2026-03-07']);

  it('adds plain elapsed time, ignoring windows, weekends and holidays', () => {
    expect(addWorkingSeconds(at('2026-03-07T12:00:00+05:30'), HOUR, cal, 'continuous')).toBe(
      at('2026-03-07T13:00:00+05:30'),
    );
    expect(addWorkingSeconds(friday1600, 24 * HOUR, cal, 'continuous')).toBe(at('2026-03-07T16:00:00+05:30'));
  });

  it('counts all elapsed seconds', () => {
    expect(workingSecondsBetween(friday1600, at('2026-03-09T10:00:00+05:30'), cal, 'continuous')).toBe(66 * HOUR);
  });
});

describe('DST in America/New_York (clocks go forward on 2026-03-08 and back on 2026-11-01)', () => {
  const zone = 'America/New_York';

  it('counts the real length of local days: 23 hours in spring and 25 hours in autumn', () => {
    const allDay = everyDay({ start: '00:00', end: '24:00' }, zone);
    expect(
      workingSecondsBetween(at('2026-03-08T00:00:00-05:00'), at('2026-03-09T00:00:00-04:00'), allDay, 'working'),
    ).toBe(23 * HOUR);
    expect(
      workingSecondsBetween(at('2026-11-01T00:00:00-04:00'), at('2026-11-02T00:00:00-05:00'), allDay, 'working'),
    ).toBe(25 * HOUR);
  });

  it('counts a 01:00-03:00 window as 1 hour when 02:00-03:00 is skipped and 3 hours when 01:00-02:00 repeats', () => {
    const early = everyDay({ start: '01:00', end: '03:00' }, zone);
    expect(
      workingSecondsBetween(at('2026-03-08T00:00:00-05:00'), at('2026-03-08T12:00:00-04:00'), early, 'working'),
    ).toBe(HOUR);
    expect(
      workingSecondsBetween(at('2026-11-01T00:00:00-04:00'), at('2026-11-01T12:00:00-05:00'), early, 'working'),
    ).toBe(3 * HOUR);
  });

  it('starts a window that begins in the skipped hour when the clocks go forward', () => {
    const fromHalfPastTwo = everyDay({ start: '02:30', end: '04:00' }, zone);
    expect(addWorkingSeconds(at('2026-03-08T00:00:00-05:00'), 60, fromHalfPastTwo, 'working')).toBe(
      at('2026-03-08T03:01:00-04:00'),
    );
  });

  it('skips a window that lies entirely inside the skipped hour', () => {
    const sundayOnly: WorkingCalendar = {
      ...noWorkingTime,
      timeZone: zone,
      weekly: { ...noWorkingTime.weekly, 7: [{ start: '02:15', end: '02:45' }] },
    };
    expect(addWorkingSeconds(at('2026-03-07T12:00:00-05:00'), 60, sundayOnly, 'working')).toBe(
      at('2026-03-15T02:16:00-04:00'),
    );
  });
});

describe('isWorkingDay', () => {
  const cal = officeHours('Asia/Kolkata', ['2026-03-10']);

  it('is true for a weekday with windows that is not a holiday', () => {
    expect(isWorkingDay('2026-03-09', cal)).toBe(true);
  });

  it('is false for a weekday without windows and for a holiday', () => {
    expect(isWorkingDay('2026-03-07', cal)).toBe(false);
    expect(isWorkingDay('2026-03-10', cal)).toBe(false);
  });

  it('is false for every date of a calendar with no working windows', () => {
    expect(isWorkingDay('2026-03-09', noWorkingTime)).toBe(false);
  });

  it.each(['2026-02-30', '2026-3-9', '09-03-2026', ''])('rejects the date %j', (date) => {
    expect(() => isWorkingDay(date, cal)).toThrow(RangeError);
  });
});

describe('calendar errors', () => {
  it('raises CalendarHasNoWorkingTime for a calendar with no working windows, in both modes', () => {
    const start = at('2026-03-09T10:00:00+05:30');
    expect(() => addWorkingSeconds(start, 60, noWorkingTime, 'working')).toThrow(CalendarHasNoWorkingTime);
    expect(() => addWorkingSeconds(start, 0, noWorkingTime, 'working')).toThrow(CalendarHasNoWorkingTime);
    expect(() => addWorkingSeconds(start, 60, noWorkingTime, 'continuous')).toThrow(CalendarHasNoWorkingTime);
    expect(() => workingSecondsBetween(start, friday1600, noWorkingTime, 'working')).toThrow(CalendarHasNoWorkingTime);
    expect(() => workingSecondsBetween(start, friday1600, noWorkingTime, 'continuous')).toThrow(
      CalendarHasNoWorkingTime,
    );
  });

  it('names the error so callers and logs can recognise it', () => {
    expect(new CalendarHasNoWorkingTime().name).toBe('CalendarHasNoWorkingTime');
  });

  it.each<[string, WorkingCalendar]>([
    ['an unknown time zone', { ...officeHours(), timeZone: 'Mars/Olympus_Mons' }],
    ['a time that is not HH:mm', everyDay({ start: '9:00', end: '17:00' }, 'Asia/Kolkata')],
    ['a window whose start is not before its end', everyDay({ start: '10:00', end: '10:00' }, 'Asia/Kolkata')],
    ['24:00 as a start time', everyDay({ start: '24:00', end: '24:00' }, 'Asia/Kolkata')],
    ['a holiday that is not a real date', officeHours('Asia/Kolkata', ['2026-02-30'])],
  ])('rejects a calendar with %s', (_reason, cal) => {
    expect(() => addWorkingSeconds(friday1600, 60, cal, 'working')).toThrow(RangeError);
    expect(() => workingSecondsBetween(friday1600, at('2026-03-09T10:00:00+05:30'), cal, 'working')).toThrow(
      RangeError,
    );
  });

  it.each([-1, 1.5, Number.NaN])('rejects a budget of %s seconds', (seconds) => {
    expect(() => addWorkingSeconds(friday1600, seconds, officeHours(), 'working')).toThrow(RangeError);
  });
});

describe('calendar arbitraries', () => {
  it('draw only time zones that this runtime knows', () => {
    for (const zone of TEST_TIME_ZONES) {
      expect(IANAZone.isValidZone(zone), zone).toBe(true);
    }
  });

  it('include zones whose offset changes between January and July', () => {
    for (const zone of DST_TIME_ZONES) {
      const iana = IANAZone.create(zone);
      expect(iana.offset(Date.UTC(2026, 0, 15)), zone).not.toBe(iana.offset(Date.UTC(2026, 6, 15)));
    }
  });

  it('generate calendars that the calendar functions accept', () => {
    const start = at('2026-03-09T00:00:00Z');
    for (const cal of fc.sample(arbCalendar(), { numRuns: 50, seed: 19 })) {
      expect(workingSecondsBetween(start, at('2026-03-16T00:00:00Z'), cal, 'working')).toBeGreaterThanOrEqual(0);
      expect(addWorkingSeconds(start, HOUR, cal, 'working')).toBeGreaterThan(start);
    }
  });

  it('generate calendars without working time that raise CalendarHasNoWorkingTime', () => {
    for (const cal of fc.sample(arbCalendarWithoutWorkingTime(), { numRuns: 10, seed: 19 })) {
      expect(() => addWorkingSeconds(at('2026-03-09T00:00:00Z'), HOUR, cal, 'working')).toThrow(
        CalendarHasNoWorkingTime,
      );
    }
  });
});
