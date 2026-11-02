// Unit tests for @campusconnect/domain/schedule
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { nextRunAt } from '../src/schedule';
import { instant } from '../src/types';

describe('schedule: nextRunAt', () => {
  /** Helper to create an instant from an ISO string */
  function isoToInstant(iso: string): ReturnType<typeof instant> {
    return instant(DateTime.fromISO(iso, { zone: 'UTC' }).toMillis());
  }

  describe('daily schedule', () => {
    it('returns next day at specified time when time has passed today', () => {
      const after = isoToInstant('2024-01-15T18:00:00Z'); // 18:00 UTC
      const result = nextRunAt({ frequency: 'daily', time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.hour).toBe(9);
      expect(resultDt.minute).toBe(0);
      expect(resultDt.day).toBe(16); // Next day
    });

    it('returns today at specified time when time has not passed', () => {
      const after = isoToInstant('2024-01-15T08:00:00Z'); // 08:00 UTC
      const result = nextRunAt({ frequency: 'daily', time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.hour).toBe(9);
      expect(resultDt.minute).toBe(0);
      expect(resultDt.day).toBe(15); // Same day
    });
  });

  describe('weekly schedule', () => {
    it('returns next occurrence on specified weekday', () => {
      // 2024-01-15 is a Monday (weekday 1)
      const after = isoToInstant('2024-01-15T10:00:00Z');
      
      // Request Friday (weekday 5)
      const result = nextRunAt({ frequency: 'weekly', weekday: 5, time: '14:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.weekday).toBe(5); // Friday
      expect(resultDt.hour).toBe(14);
      expect(resultDt.minute).toBe(0);
      expect(resultDt.day).toBe(19); // 2024-01-19 is a Friday
    });

    it('returns same weekday next week if time has passed this week', () => {
      // 2024-01-15 is a Monday (weekday 1)
      const after = isoToInstant('2024-01-15T15:00:00Z'); // 15:00 UTC on Monday
      
      // Request Monday (weekday 1) at 14:00
      const result = nextRunAt({ frequency: 'weekly', weekday: 1, time: '14:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.weekday).toBe(1); // Monday
      expect(resultDt.hour).toBe(14);
      expect(resultDt.day).toBe(22); // Next Monday
    });
  });

  describe('monthly schedule', () => {
    it('returns next occurrence on specified day of month', () => {
      const after = isoToInstant('2024-01-10T10:00:00Z');
      const result = nextRunAt({ frequency: 'monthly', dayOfMonth: 15, time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.day).toBe(15);
      expect(resultDt.month).toBe(1);
      expect(resultDt.hour).toBe(9);
    });

    it('returns next month when day has passed this month', () => {
      const after = isoToInstant('2024-01-20T10:00:00Z');
      const result = nextRunAt({ frequency: 'monthly', dayOfMonth: 15, time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.day).toBe(15);
      expect(resultDt.month).toBe(2); // February
    });

    it('handles day 31 in months with fewer days', () => {
      const after = isoToInstant('2024-02-15T10:00:00Z');
      const result = nextRunAt({ frequency: 'monthly', dayOfMonth: 31, time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.day).toBe(31); // Will wrap to day 31 in March
      expect(resultDt.month).toBe(3);
    });
  });

  describe('quarterly schedule', () => {
    it('returns next occurrence in Q1 month (January, April, July, October)', () => {
      // Start in early January
      const after = isoToInstant('2024-01-05T10:00:00Z');
      const result = nextRunAt({ frequency: 'quarterly', dayOfMonth: 15, time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.day).toBe(15);
      expect(resultDt.month).toBe(1);
    });

    it('returns next quarter when day passed', () => {
      // Start after the 15th in January
      const after = isoToInstant('2024-01-20T10:00:00Z');
      const result = nextRunAt({ frequency: 'quarterly', dayOfMonth: 15, time: '09:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.day).toBe(15);
      expect(resultDt.month).toBe(4); // April
    });
  });

  describe('weekly_digest schedule', () => {
    it('works like weekly schedule', () => {
      const after = isoToInstant('2024-01-15T10:00:00Z');
      const result = nextRunAt({ frequency: 'weekly_digest', weekday: 3, time: '08:00' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      expect(resultDt.weekday).toBe(3); // Wednesday
      expect(resultDt.hour).toBe(8);
    });
  });

  describe('erp_24h schedule', () => {
    it('returns 24 hours in the future', () => {
      const after = isoToInstant('2024-01-15T10:00:00Z');
      const result = nextRunAt({ frequency: 'erp_24h' }, after, 'UTC');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'UTC' });

      // Should be 2024-01-16T10:00:00Z (24 hours later)
      expect(resultDt.day).toBe(16);
      expect(resultDt.hour).toBe(10);
    });

    it('always returns exactly 24 hours later', () => {
      const after = isoToInstant('2024-01-15T14:37:45Z');
      const result = nextRunAt({ frequency: 'erp_24h' }, after, 'UTC');

      const expectedMs = Number(after) + 24 * 60 * 60 * 1000;
      expect(Number(result)).toBe(expectedMs);
    });
  });

  describe('result is always strictly after the input', () => {
    it('daily never returns same instant', () => {
      const after = isoToInstant('2024-01-15T09:00:00Z');
      const result = nextRunAt({ frequency: 'daily', time: '09:00' }, after, 'UTC');

      expect(Number(result)).toBeGreaterThan(Number(after));
    });

    it('weekly never returns same instant', () => {
      const after = isoToInstant('2024-01-15T09:00:00Z'); // Monday 09:00
      const result = nextRunAt({ frequency: 'weekly', weekday: 1, time: '09:00' }, after, 'UTC');

      expect(Number(result)).toBeGreaterThan(Number(after));
    });
  });

  describe('time zone handling', () => {
    it('respects time zone when calculating next run', () => {
      // 2024-01-15T23:00:00Z is 2024-01-16T04:30:00 in Asia/Kathmandu (UTC+5:45)
      const after = isoToInstant('2024-01-15T23:00:00Z');
      const result = nextRunAt({ frequency: 'daily', time: '09:00' }, after, 'Asia/Kathmandu');
      const resultDt = DateTime.fromMillis(Number(result), { zone: 'Asia/Kathmandu' });

      expect(resultDt.hour).toBe(9);
      expect(resultDt.minute).toBe(0);
    });
  });
});
