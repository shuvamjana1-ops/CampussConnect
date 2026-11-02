import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { codePointLength } from './text';
import { validate } from './validate';
import {
  ANALYTICS_PERIOD_MAX_DAYS,
  ETA_MAX_DAYS_AHEAD,
  FIELD_BOUNDS,
  Fields,
  analyticsPeriodSchema,
  csatRatingSchema,
  etaField,
  opportunityDeadlineField,
  reportRecipientsField,
  type TextBounds,
} from './validation';

/**
 * Feature: campusconnect-platform, Property 2: Validation accepts exactly in-bounds values
 *
 * **Validates: Requirements 1.6, 4.2, 4.10, 6.4, 6.10, 6.11, 7.8, 7.11, 8.2, 8.3, 8.5, 10.10, 10.11, 14.1, 14.7, 14.8, 15.2, 16.12, 20.8, 20.9, 22.4**
 */

const DAY_MS = 86_400_000;

const TEXT_KEYS = [
  'reason',
  'revealReason',
  'decisionRationale',
  'internalNote',
  'opportunityTitle',
  'opportunityDescription',
  'copilotMessage',
  'csatComment',
] as const;

const INTEGER_KEYS = ['kAnonymity', 'spikeClusterK', 'sessionIdleMinutes', 'csatScore', 'attachmentSizeBytes'] as const;

const CHOICE_KEYS = [
  'applicationOutcome',
  'reportFrequency',
  'reportFormat',
  'ticketAttachmentType',
  'documentLockerAttachmentType',
] as const;

/** Characters of 1, 2 and combining-sequence widths so that code points, UTF-16 units and NFC differ. */
const charArb = fc.constantFrom('a', 'Z', '7', ' ', '\n', '😀', 'नमस्ते'.charAt(0), 'e\u0301', '\u0958', 'é', 'ह');

/** Text of a length that clusters around the bounds, so both sides of each bound are hit. */
function textNear(bounds: TextBounds): fc.Arbitrary<string> {
  const lengths = fc.oneof(
    fc.integer({ min: Math.max(0, bounds.min - 3), max: bounds.max + 3 }),
    fc.constantFrom(bounds.min - 1, bounds.min, bounds.max, bounds.max + 1).filter((n) => n >= 0),
  );
  return lengths.chain((length) =>
    fc.array(charArb, { minLength: 0, maxLength: 3 }).map((noise) => {
      const base = 'x'.repeat(length);
      return noise.length > 0 && length >= noise.length ? noise.join('') + base.slice(noise.length) : base;
    }),
  );
}

function measured(value: string, bounds: TextBounds): number {
  const normalised = value.normalize('NFC');
  return codePointLength(bounds.trim ? normalised.trim() : normalised);
}

describe('Property 2: Validation accepts exactly in-bounds values', () => {
  it.each(TEXT_KEYS)('text field %s accepts iff code-point length after NFC (and trim) is within bounds', (key) => {
    const bounds: TextBounds = FIELD_BOUNDS[key];
    const candidate = fc.oneof(
      textNear(bounds),
      fc.array(charArb, { maxLength: bounds.max + 2 }).map((chars) => chars.join('')),
      fc.string({ unit: 'binary', maxLength: 40 }),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        const length = measured(value, bounds);
        const expected = !value.includes('\u0000') && length >= bounds.min && length <= bounds.max;
        const result = validate(Fields[key], value);
        expect(result.ok).toBe(expected);
        if (!result.ok) {
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.every((e) => e.path === '')).toBe(true);
        } else {
          expect(result.value).toBe(bounds.trim ? value.normalize('NFC').trim() : value.normalize('NFC'));
        }
      }),
    );
  });

  it.each(INTEGER_KEYS)('integer field %s accepts iff it is a whole number within bounds', (key) => {
    const { min, max } = FIELD_BOUNDS[key];
    const candidate = fc.oneof(
      fc.integer({ min: min - 3, max: max + 3 }),
      fc.constantFrom(min - 1, min, min + 1, max - 1, max, max + 1),
      fc.integer(),
      fc.double({ noNaN: false }),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        const expected = Number.isInteger(value) && value >= min && value <= max;
        const result = validate(Fields[key], value);
        expect(result.ok).toBe(expected);
        if (!result.ok) {
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]?.path).toBe('');
        }
      }),
    );
  });

  it('SLA duration accepts iff it is a positive safe integer', () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.double(), fc.constantFrom(0, 1, 2 ** 53)), (value) => {
        const expected = Number.isSafeInteger(value) && value >= 1;
        expect(validate(Fields.slaDurationMinutes, value).ok).toBe(expected);
      }),
    );
  });

  it('confidence threshold accepts iff it is within 0 to 1 with at most two decimal places', () => {
    const candidate = fc.oneof(
      fc.integer({ min: -5, max: 105 }).map((n) => n / 100),
      fc.integer({ min: -50, max: 1050 }).map((n) => n / 1000),
      fc.double({ min: -1, max: 2, noNaN: true }),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        // At most two decimal places: the value is the double nearest to some k / 100.
        const twoPlaces = Math.round(value * 100) / 100 === value;
        const expected = value >= 0 && value <= 1 && twoPlaces;
        expect(validate(Fields.confidenceThreshold, value).ok).toBe(expected);
      }),
    );
  });

  it.each(CHOICE_KEYS)('choice field %s accepts iff the value is in the allowed list', (key) => {
    const allowed: readonly string[] = FIELD_BOUNDS[key].values;
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...allowed), fc.string({ maxLength: 20 })), (value) => {
        const result = validate(Fields[key], value);
        expect(result.ok).toBe(allowed.includes(value));
        if (!result.ok) {
          expect(result.errors[0]).toMatchObject({ path: '', rule: 'enum', allowed });
        }
      }),
    );
  });

  it('bulk reassignment accepts iff there are 2 to 100 distinct UUIDs', () => {
    const uuid = fc.uuid();
    const candidate = fc.oneof(
      fc.array(uuid, { minLength: 0, maxLength: 103 }),
      fc.uniqueArray(uuid, { minLength: 0, maxLength: 103 }),
      fc.uniqueArray(uuid, { minLength: 1, maxLength: 5 }).chain((ids) =>
        fc.constantFrom(...ids).map((dup) => [...ids, dup]),
      ),
    );
    const { min, max } = FIELD_BOUNDS.bulkReassignTicketIds;
    fc.assert(
      fc.property(candidate, (ids) => {
        const expected = ids.length >= min && ids.length <= max && new Set(ids).size === ids.length;
        expect(validate(Fields.bulkReassignTicketIds, ids).ok).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('report recipients accept iff there are 1 to 20 UUIDs that all belong to the Tenant', () => {
    const tenantPool = fc.uniqueArray(fc.uuid(), { minLength: 25, maxLength: 25 });
    fc.assert(
      fc.property(
        tenantPool,
        fc.uuid(),
        fc.integer({ min: 0, max: 23 }),
        fc.boolean(),
        (pool, outsider, count, includeOutsider) => {
          const members = new Set(pool);
          const ids = pool.slice(0, count);
          if (includeOutsider && count > 0) {
            ids[count - 1] = outsider;
          }
          const schema = reportRecipientsField({ isTenantUser: (id) => members.has(id) });
          const expected = ids.length >= 1 && ids.length <= 20 && ids.every((id) => members.has(id));
          expect(validate(schema, ids).ok).toBe(expected);
        },
      ),
    );
  });

  it('CSAT rating accepts iff score is 1 to 5, comment is within 1,000 characters, and no field is unknown', () => {
    const score = fc.oneof(fc.integer({ min: -2, max: 8 }), fc.double(), fc.constant(undefined));
    const comment = fc.oneof(fc.constant(undefined), textNear({ kind: 'text', min: 0, max: 1000, trim: false }));
    fc.assert(
      fc.property(score, comment, fc.boolean(), (s, c, extra) => {
        const input: Record<string, unknown> = {};
        if (s !== undefined) {
          input.score = s;
        }
        if (c !== undefined) {
          input.comment = c;
        }
        if (extra) {
          input.extra = true;
        }
        const expected =
          s !== undefined &&
          Number.isInteger(s) &&
          s >= 1 &&
          s <= 5 &&
          (c === undefined || codePointLength(c.normalize('NFC')) <= 1000) &&
          !extra;
        expect(validate(csatRatingSchema, input).ok).toBe(expected);
      }),
    );
  });

  it('ETA accepts iff now < eta <= now + 30 days', () => {
    const now = new Date('2026-03-10T09:00:00.000Z');
    const schema = etaField({ now });
    const latest = now.getTime() + ETA_MAX_DAYS_AHEAD * DAY_MS;
    const offset = fc.oneof(
      fc.integer({ min: -2 * DAY_MS, max: 32 * DAY_MS }),
      fc.constantFrom(-1, 0, 1, latest - now.getTime() - 1, latest - now.getTime(), latest - now.getTime() + 1),
    );
    fc.assert(
      fc.property(offset, (delta) => {
        const at = now.getTime() + delta;
        expect(validate(schema, new Date(at).toISOString()).ok).toBe(at > now.getTime() && at <= latest);
      }),
    );
  });

  it('Opportunity deadline accepts iff it is strictly after now', () => {
    const now = new Date('2026-03-10T09:00:00.000Z');
    const schema = opportunityDeadlineField({ now });
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: -DAY_MS, max: DAY_MS }), fc.constantFrom(-1, 0, 1)), (delta) => {
        expect(validate(schema, new Date(now.getTime() + delta).toISOString()).ok).toBe(delta > 0);
      }),
    );
  });

  it('analytics period accepts iff start <= end and it spans 1 to 366 days inclusive', () => {
    const base = Date.UTC(2024, 0, 1);
    const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 800 }),
        fc.oneof(fc.integer({ min: -3, max: 370 }), fc.constantFrom(-1, 0, 364, 365, 366)),
        (startDay, lengthDays) => {
          const start = base + startDay * DAY_MS;
          const end = start + lengthDays * DAY_MS;
          const span = lengthDays + 1;
          const expected = lengthDays >= 0 && span <= ANALYTICS_PERIOD_MAX_DAYS;
          expect(validate(analyticsPeriodSchema, { start: iso(start), end: iso(end) }).ok).toBe(expected);
        },
      ),
    );
  });

  it('a rejection reports the field path of every invalid field and never echoes the submitted value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 100 }), fc.string({ minLength: 1001, maxLength: 1100 }), (score, comment) => {
        const result = validate(csatRatingSchema, { score, comment });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.map((e) => e.path).sort()).toEqual(['comment', 'score']);
          expect(JSON.stringify(result.errors)).not.toContain(comment);
        }
      }),
    );
  });
});
