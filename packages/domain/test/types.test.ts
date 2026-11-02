import { describe, expect, it } from 'vitest';
import { departmentId, instant, tenantId, ticketId, userId } from '../src/types';

describe('instant', () => {
  it('brands whole epoch milliseconds without changing them', () => {
    expect(instant(0)).toBe(0);
    expect(instant(Date.UTC(2026, 2, 9, 3, 30, 0, 250))).toBe(Date.UTC(2026, 2, 9, 3, 30, 0, 250));
    expect(instant(-8.64e15)).toBe(-8.64e15);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1])('rejects %s', (value) => {
    expect(() => instant(value)).toThrow(RangeError);
  });
});

describe('branded ids', () => {
  const uuid = '01890a5d-ac96-774b-bcce-b302099a8057';

  it('accept UUIDs and lower-case them so equal ids compare equal', () => {
    expect(tenantId(uuid.toUpperCase())).toBe(uuid);
    expect(userId(uuid)).toBe(uuid);
    expect(departmentId(uuid)).toBe(uuid);
    expect(ticketId(uuid)).toBe(uuid);
  });

  it.each(['', 'tenant-1', `${uuid}0`, `{${uuid}}`])('reject %j', (value) => {
    expect(() => tenantId(value)).toThrow(RangeError);
    expect(() => userId(value)).toThrow(RangeError);
    expect(() => departmentId(value)).toThrow(RangeError);
    expect(() => ticketId(value)).toThrow(RangeError);
  });
});
