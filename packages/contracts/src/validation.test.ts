import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { type FieldError, validate } from './validate';
import {
  FIELD_BOUNDS,
  Fields,
  analyticsPeriodSchema,
  csatRatingSchema,
  etaField,
  incidentSchema,
  incidentTargetDateField,
  opportunityDeadlineField,
  reportScheduleSchema,
} from './validation';

function errorsOf(schema: z.ZodType, input: unknown): readonly FieldError[] {
  const result = validate(schema, input);
  return result.ok ? [] : result.errors;
}

function accepts(schema: z.ZodType, input: unknown): boolean {
  return validate(schema, input).ok;
}

function byPath(errors: readonly FieldError[]): FieldError[] {
  return [...errors].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const id = (n: number): string => `0190f5a0-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => id(index + 1));

const TEXT_FIELDS = [
  'reason',
  'revealReason',
  'decisionRationale',
  'internalNote',
  'opportunityTitle',
  'opportunityDescription',
  'copilotMessage',
  'csatComment',
] as const;

const BOUNDED_INTEGER_FIELDS = [
  'kAnonymity',
  'spikeClusterK',
  'sessionIdleMinutes',
  'csatScore',
  'attachmentSizeBytes',
] as const;

describe('text fields', () => {
  it.each(TEXT_FIELDS)('%s accepts exactly the lengths within its bounds', (key) => {
    const { min, max } = FIELD_BOUNDS[key];
    const schema = Fields[key];
    const lengthError = [{ path: '', rule: 'length', min, max }];
    expect(accepts(schema, 'a'.repeat(min))).toBe(true);
    expect(accepts(schema, 'a'.repeat(max))).toBe(true);
    expect(errorsOf(schema, 'a'.repeat(max + 1))).toEqual(lengthError);
    if (min > 0) {
      expect(errorsOf(schema, 'a'.repeat(min - 1))).toEqual(lengthError);
    }
  });

  it('counts code points after NFC normalisation and returns the normalised text', () => {
    // 200 emoji are 400 UTF-16 code units but 200 code points.
    expect(accepts(Fields.opportunityTitle, '😀'.repeat(200))).toBe(true);
    expect(errorsOf(Fields.opportunityTitle, '😀'.repeat(201))).toEqual([
      { path: '', rule: 'length', min: 1, max: 200 },
    ]);
    // A decomposed é (e + U+0301) is one code point after NFC, and the parsed value is the composed form.
    expect(validate(Fields.opportunityTitle, 'e\u0301'.repeat(200))).toEqual({ ok: true, value: '\u00e9'.repeat(200) });
    // U+0958 (Devanagari QA) is a composition exclusion and is two code points after NFC.
    expect(accepts(Fields.opportunityTitle, '\u0958'.repeat(100))).toBe(true);
    expect(accepts(Fields.opportunityTitle, '\u0958'.repeat(101))).toBe(false);
  });

  it('trims reasons and Copilot messages before measuring', () => {
    expect(errorsOf(Fields.reason, '   ')).toEqual([{ path: '', rule: 'length', min: 1, max: 500 }]);
    expect(validate(Fields.reason, `  ${'r'.repeat(500)}\n`)).toEqual({ ok: true, value: 'r'.repeat(500) });
    expect(errorsOf(Fields.copilotMessage, ' \t ')).toEqual([{ path: '', rule: 'length', min: 1, max: 2000 }]);
  });

  it('keeps surrounding whitespace in fields that are not measured after trim', () => {
    expect(validate(Fields.internalNote, ' note ')).toEqual({ ok: true, value: ' note ' });
  });

  it('rejects U+0000', () => {
    expect(errorsOf(Fields.internalNote, 'a\u0000b')).toEqual([{ path: '', rule: 'characters' }]);
  });

  it('reports a missing value as required and a non-string as a type error', () => {
    expect(errorsOf(Fields.internalNote, undefined)).toEqual([{ path: '', rule: 'required' }]);
    expect(errorsOf(Fields.internalNote, 42)).toEqual([{ path: '', rule: 'type', expected: 'string' }]);
  });
});

describe('number fields', () => {
  it.each(BOUNDED_INTEGER_FIELDS)('%s accepts exactly the whole numbers within its bounds', (key) => {
    const { min, max } = FIELD_BOUNDS[key];
    const schema = Fields[key];
    const rangeError = [{ path: '', rule: 'range', min, max }];
    expect(accepts(schema, min)).toBe(true);
    expect(accepts(schema, max)).toBe(true);
    expect(errorsOf(schema, min - 1)).toEqual(rangeError);
    expect(errorsOf(schema, max + 1)).toEqual(rangeError);
    expect(errorsOf(schema, min + 0.5)).toEqual([{ path: '', rule: 'integer' }]);
    expect(errorsOf(schema, String(min))).toEqual([{ path: '', rule: 'type', expected: 'number' }]);
  });

  it('accepts any positive whole number of SLA minutes', () => {
    expect(accepts(Fields.slaDurationMinutes, 1)).toBe(true);
    expect(accepts(Fields.slaDurationMinutes, 525_600)).toBe(true);
    expect(errorsOf(Fields.slaDurationMinutes, 0)).toEqual([{ path: '', rule: 'range', min: 1 }]);
    expect(errorsOf(Fields.slaDurationMinutes, 1.5)).toEqual([{ path: '', rule: 'integer' }]);
    expect(errorsOf(Fields.slaDurationMinutes, 2 ** 53)).toEqual([{ path: '', rule: 'integer' }]);
  });

  it('accepts confidence thresholds from 0.00 to 1.00 with at most two decimal places', () => {
    for (const value of [0, 0.07, 0.29, 0.7, 0.99, 1]) {
      expect(accepts(Fields.confidenceThreshold, value)).toBe(true);
    }
    expect(errorsOf(Fields.confidenceThreshold, 1.01)).toEqual([{ path: '', rule: 'range', min: 0, max: 1 }]);
    expect(errorsOf(Fields.confidenceThreshold, -0.01)).toEqual([{ path: '', rule: 'range', min: 0, max: 1 }]);
    expect(errorsOf(Fields.confidenceThreshold, 0.705)).toEqual([{ path: '', rule: 'precision', max: 2 }]);
  });
});

describe('choice fields', () => {
  it('accepts only the listed application outcomes and reports the allowed list', () => {
    expect(accepts(Fields.applicationOutcome, 'not_selected')).toBe(true);
    expect(errorsOf(Fields.applicationOutcome, 'pending')).toEqual([
      { path: '', rule: 'enum', allowed: ['selected', 'not_selected', 'withdrawn'] },
    ]);
  });

  it('allows MP4 for Ticket attachments but not for Document_Locker', () => {
    expect(accepts(Fields.ticketAttachmentType, 'video/mp4')).toBe(true);
    expect(accepts(Fields.documentLockerAttachmentType, 'video/mp4')).toBe(false);
    expect(accepts(Fields.documentLockerAttachmentType, 'application/pdf')).toBe(true);
  });
});

describe('bulk reassignment selection', () => {
  it('accepts 2 to 100 Ticket ids', () => {
    const countError = [{ path: '', rule: 'count', min: 2, max: 100 }];
    expect(accepts(Fields.bulkReassignTicketIds, ids(2))).toBe(true);
    expect(accepts(Fields.bulkReassignTicketIds, ids(100))).toBe(true);
    expect(errorsOf(Fields.bulkReassignTicketIds, ids(1))).toEqual(countError);
    expect(errorsOf(Fields.bulkReassignTicketIds, ids(101))).toEqual(countError);
  });

  it('rejects repeated ids and ids that are not UUIDs', () => {
    expect(errorsOf(Fields.bulkReassignTicketIds, [id(1), id(2), id(1)])).toEqual([{ path: '', rule: 'distinct' }]);
    expect(errorsOf(Fields.bulkReassignTicketIds, [id(1), 'TKT-2026-000123'])).toEqual([
      { path: '1', rule: 'format', expected: 'uuid' },
    ]);
  });
});

describe('time-dependent fields', () => {
  const now = new Date('2026-03-10T09:00:00.000Z');

  it('accepts an ETA after now and at most 30 days ahead', () => {
    const eta = etaField({ now });
    const windowError = [
      { path: '', rule: 'window', min: '2026-03-10T09:00:00.000Z', max: '2026-04-09T09:00:00.000Z' },
    ];
    expect(accepts(eta, '2026-03-10T09:00:00.001Z')).toBe(true);
    expect(accepts(eta, '2026-04-09T09:00:00.000Z')).toBe(true);
    expect(accepts(eta, '2026-03-10T15:00:00+05:30')).toBe(true);
    expect(errorsOf(eta, '2026-03-10T09:00:00.000Z')).toEqual(windowError);
    expect(errorsOf(eta, '2026-04-09T09:00:00.001Z')).toEqual(windowError);
    expect(errorsOf(eta, 'next week')).toEqual([{ path: '', rule: 'format', expected: 'datetime' }]);
  });

  it('accepts an Opportunity deadline only when it is strictly in the future', () => {
    const deadline = opportunityDeadlineField({ now });
    expect(accepts(deadline, '2026-03-10T09:00:01Z')).toBe(true);
    expect(errorsOf(deadline, '2026-03-10T09:00:00Z')).toEqual([
      { path: '', rule: 'future', min: '2026-03-10T09:00:00.000Z' },
    ]);
  });

  it('accepts an incident target date from today in the Tenant time zone', () => {
    // 20:00 UTC on 10 March is 01:30 on 11 March in Asia/Kolkata.
    const targetDate = incidentTargetDateField({ now: new Date('2026-03-10T20:00:00Z'), timeZone: 'Asia/Kolkata' });
    expect(accepts(targetDate, '2026-03-11')).toBe(true);
    expect(accepts(targetDate, '2027-01-01')).toBe(true);
    expect(errorsOf(targetDate, '2026-03-10')).toEqual([{ path: '', rule: 'not_before', min: '2026-03-11' }]);
    expect(errorsOf(targetDate, '2026-02-30')).toEqual([{ path: '', rule: 'format', expected: 'date' }]);
  });
});

describe('composite schemas', () => {
  it('validates a CSAT rating and rejects unknown fields', () => {
    expect(accepts(csatRatingSchema, { score: 5 })).toBe(true);
    expect(accepts(csatRatingSchema, { score: 4, comment: '' })).toBe(true);
    expect(byPath(errorsOf(csatRatingSchema, { score: 0, comment: 'c'.repeat(1001), extra: true }))).toEqual([
      { path: 'comment', rule: 'length', min: 0, max: 1000 },
      { path: 'extra', rule: 'unknown_field' },
      { path: 'score', rule: 'range', min: 1, max: 5 },
    ]);
    expect(errorsOf(csatRatingSchema, {})).toEqual([{ path: 'score', rule: 'required' }]);
  });

  it('validates an analytics period of 1 to 366 days that does not end before it starts', () => {
    expect(accepts(analyticsPeriodSchema, { start: '2026-03-10', end: '2026-03-10' })).toBe(true);
    expect(accepts(analyticsPeriodSchema, { start: '2024-01-01', end: '2024-12-31' })).toBe(true);
    expect(errorsOf(analyticsPeriodSchema, { start: '2024-01-01', end: '2025-01-01' })).toEqual([
      { path: 'end', rule: 'span', min: 1, max: 366 },
    ]);
    expect(errorsOf(analyticsPeriodSchema, { start: '2026-03-10', end: '2026-03-09' })).toEqual([
      { path: 'end', rule: 'order' },
    ]);
  });

  it('validates a report schedule against the users of the Tenant', () => {
    const tenantUsers = new Set(ids(25));
    const schedule = reportScheduleSchema({ isTenantUser: (userId) => tenantUsers.has(userId) });
    const countError = { path: 'recipients', rule: 'count', min: 1, max: 20 };
    expect(accepts(schedule, { frequency: 'weekly', format: 'csv', recipients: ids(20) })).toBe(true);
    expect(byPath(errorsOf(schedule, { recipients: [] }))).toEqual([
      { path: 'format', rule: 'required' },
      { path: 'frequency', rule: 'required' },
      countError,
    ]);
    expect(errorsOf(schedule, { frequency: 'weekly', format: 'csv', recipients: ids(21) })).toEqual([countError]);
    expect(errorsOf(schedule, { frequency: 'weekly', format: 'csv', recipients: [id(1), id(99)] })).toEqual([
      { path: 'recipients.1', rule: 'tenant_member' },
    ]);
  });

  it('validates an incident owner and target date together', () => {
    const owner = id(7);
    const incident = incidentSchema({
      now: new Date('2026-03-10T09:00:00Z'),
      timeZone: 'Asia/Kolkata',
      isActiveStaffUser: (userId) => userId === owner,
    });
    expect(accepts(incident, { ownerId: owner, targetDate: '2026-03-10' })).toBe(true);
    expect(byPath(errorsOf(incident, {}))).toEqual([
      { path: 'ownerId', rule: 'required' },
      { path: 'targetDate', rule: 'required' },
    ]);
    expect(byPath(errorsOf(incident, { ownerId: id(8), targetDate: '2026-03-09' }))).toEqual([
      { path: 'ownerId', rule: 'active_staff' },
      { path: 'targetDate', rule: 'not_before', min: '2026-03-10' },
    ]);
  });
});

describe('validate', () => {
  const configChange = z.strictObject({
    kAnonymity: Fields.kAnonymity.optional(),
    confidenceThreshold: Fields.confidenceThreshold.optional(),
    sessionIdleMinutes: Fields.sessionIdleMinutes.optional(),
    period: analyticsPeriodSchema.optional(),
  });

  it('returns every invalid field path with its rule and bounds', () => {
    const errors = errorsOf(configChange, {
      kAnonymity: 1,
      confidenceThreshold: 1.5,
      sessionIdleMinutes: 30,
      period: { start: '2026-03-10', end: '2026-03-01' },
      theme: 'dark',
    });
    expect(byPath(errors)).toEqual([
      { path: 'confidenceThreshold', rule: 'range', min: 0, max: 1 },
      { path: 'kAnonymity', rule: 'range', min: 2, max: 1000 },
      { path: 'period.end', rule: 'order' },
      { path: 'theme', rule: 'unknown_field' },
    ]);
  });

  it('returns the parsed value when the input is valid', () => {
    expect(validate(configChange, { kAnonymity: 5 })).toEqual({ ok: true, value: { kAnonymity: 5 } });
  });

  it('never includes the submitted value in an error', () => {
    expect(JSON.stringify(errorsOf(Fields.reason, 'secret '.repeat(100)))).not.toContain('secret');
  });
});
