/**
 * Validation catalogue: one Zod spec per bounded field in the design's validation catalogue.
 * API pipes, PWA forms and tests all use these specs, and {@link validate} turns a failure into
 * every invalid field path with its rule and bounds (22.4).
 *
 * Conventions:
 * - Text lengths are Unicode code points after NFC normalisation (and after trimming where the row says
 *   "after trim"). The parsed value is the normalised text. Text never contains U+0000.
 * - Request bodies are built with `z.strictObject`, so unknown fields are rejected with `unknown_field`.
 * - Rules that depend on the current time, the Tenant time zone or Tenant users are factories that take
 *   that context, so the API and the PWA evaluate them the same way.
 */
import { z } from 'zod';

import { codePointLength } from './text';
import { ruleParams, type RuleDetails } from './validate';

/** Text bounds: length in code points after NFC normalisation, and after trimming when `trim` is set. */
export interface TextBounds {
  readonly kind: 'text';
  readonly min: number;
  readonly max: number;
  readonly trim: boolean;
}

/** Whole-number bounds, inclusive. No `max` means no upper bound other than the safe-integer range. */
export interface IntegerBounds {
  readonly kind: 'integer';
  readonly min: number;
  readonly max?: number;
}

/** Decimal bounds, inclusive, with at most `places` decimal places. */
export interface DecimalBounds {
  readonly kind: 'decimal';
  readonly min: number;
  readonly max: number;
  readonly places: number;
}

/** One value from a fixed list. */
export interface ChoiceBounds {
  readonly kind: 'choice';
  readonly values: readonly [string, ...string[]];
}

/** A list of UUIDs with `min` to `max` items, all different when `distinct` is set. */
export interface IdListBounds {
  readonly kind: 'id_list';
  readonly min: number;
  readonly max: number;
  readonly distinct: boolean;
}

export type FieldBounds = TextBounds | IntegerBounds | DecimalBounds | ChoiceBounds | IdListBounds;

/** Largest accepted attachment, 10 MB (3.14, 12.9). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Most attachments a Ticket can have, counting accepted and pending ones (3.14). */
export const TICKET_ATTACHMENT_LIMIT = 5;

/** A Handler ETA after L1 is at most this many calendar days ahead (6.4). */
export const ETA_MAX_DAYS_AHEAD = 30;

/** An analytics period spans 1 to 366 days, counting both the start and end dates (14.1). */
export const ANALYTICS_PERIOD_MIN_DAYS = 1;
export const ANALYTICS_PERIOD_MAX_DAYS = 366;

const DAY_MS = 86_400_000;
const NUL = '\u0000';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Bounds for every context-free row of the validation catalogue. */
export const FIELD_BOUNDS = {
  /** SLA durations: positive whole minutes (1.6). */
  slaDurationMinutes: { kind: 'integer', min: 1 },
  /** Triage, duplicate and Copilot confidence thresholds: 0.00 to 1.00 with two decimal places (1.6, 5.5, 16.2). */
  confidenceThreshold: { kind: 'decimal', min: 0, max: 1, places: 2 },
  /** `kAnonymity`: whole number 2 to 1000 (1.6). */
  kAnonymity: { kind: 'integer', min: 2, max: 1000 },
  /** `spikeClusterK`: whole number 3 to 20 (14.5). */
  spikeClusterK: { kind: 'integer', min: 3, max: 20 },
  /** Session idle timeout: 5 to 480 minutes (2.7). */
  sessionIdleMinutes: { kind: 'integer', min: 5, max: 480 },
  /** Status-change, band-change, bulk-reassign, dispute and reopen reasons: 1 to 500 characters after trim (4.2, 4.10, 6.10, 6.11, 7.8). */
  reason: { kind: 'text', min: 1, max: 500, trim: true },
  /** Confidential identity reveal reason: 10 to 500 characters (8.2, 8.3). */
  revealReason: { kind: 'text', min: 10, max: 500, trim: false },
  /** L3 Grievance decision rationale: 20 to 5,000 characters (8.5). */
  decisionRationale: { kind: 'text', min: 20, max: 5000, trim: false },
  /** Internal note: 1 to 5,000 characters (7.11). */
  internalNote: { kind: 'text', min: 1, max: 5000, trim: false },
  /** Bulk reassignment selection: 2 to 100 distinct Ticket ids (7.8). */
  bulkReassignTicketIds: { kind: 'id_list', min: 2, max: 100, distinct: true },
  /** Opportunity title: 1 to 200 characters (10.10, 10.11). */
  opportunityTitle: { kind: 'text', min: 1, max: 200, trim: false },
  /** Opportunity description: 1 to 5,000 characters (10.10, 10.11). */
  opportunityDescription: { kind: 'text', min: 1, max: 5000, trim: false },
  /** Application outcome: Selected, Not Selected or Withdrawn (12.6, 12.7). */
  applicationOutcome: { kind: 'choice', values: ['selected', 'not_selected', 'withdrawn'] },
  /** Copilot message: 1 to 2,000 characters after trim (16.1, 16.12). */
  copilotMessage: { kind: 'text', min: 1, max: 2000, trim: true },
  /** CSAT score: whole number 1 to 5 (4.8, 20.8, 20.9). */
  csatScore: { kind: 'integer', min: 1, max: 5 },
  /** CSAT comment: 0 to 1,000 characters (20.8, 20.9). */
  csatComment: { kind: 'text', min: 0, max: 1000, trim: false },
  /** Report schedule frequency (15.1, 15.2). */
  reportFrequency: { kind: 'choice', values: ['daily', 'weekly', 'monthly', 'quarterly'] },
  /** Report format (15.1, 15.2). */
  reportFormat: { kind: 'choice', values: ['pdf', 'csv'] },
  /** Report recipients: 1 to 20 user ids, all users of the Tenant (15.2). Membership needs context, see {@link reportRecipientsField}. */
  reportRecipients: { kind: 'id_list', min: 1, max: 20, distinct: false },
  /** Attachment size: 1 byte to 10 MB (3.14, 3.15, 12.9, 12.10). */
  attachmentSizeBytes: { kind: 'integer', min: 1, max: ATTACHMENT_MAX_BYTES },
  /** Declared Ticket attachment type: PDF, JPEG, PNG or MP4. Magic bytes are checked after upload (3.14, 3.15). */
  ticketAttachmentType: { kind: 'choice', values: ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'] },
  /** Declared Document_Locker type: PDF, JPEG or PNG. Magic bytes are checked after upload (12.9, 12.10). */
  documentLockerAttachmentType: { kind: 'choice', values: ['application/pdf', 'image/jpeg', 'image/png'] },
} as const satisfies Record<string, FieldBounds>;

/** Text spec: NFC-normalised (then trimmed when `trim` is set), no U+0000, code-point length within bounds. */
export function textField(bounds: TextBounds) {
  const normalised = z.string().normalize('NFC');
  const prepared = bounds.trim ? normalised.trim() : normalised;
  return prepared
    .refine((value) => !value.includes(NUL), { params: ruleParams('characters'), abort: true })
    .refine(
      (value) => {
        const length = codePointLength(value);
        return length >= bounds.min && length <= bounds.max;
      },
      { params: ruleParams('length', { min: bounds.min, max: bounds.max }) },
    );
}

/** Whole-number spec. A whole number is a safe integer, so values that lose precision in JSON are rejected. */
export function integerField(bounds: IntegerBounds) {
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  return z
    .number()
    .refine((value) => Number.isSafeInteger(value), { params: ruleParams('integer'), abort: true })
    .refine((value) => value >= bounds.min && value <= max, {
      params: ruleParams('range', rangeDetails(bounds.min, bounds.max)),
    });
}

/** Decimal spec: within bounds and exactly representable with at most `places` decimal places. */
export function decimalField(bounds: DecimalBounds) {
  return z
    .number()
    .refine((value) => value >= bounds.min && value <= bounds.max, {
      params: ruleParams('range', { min: bounds.min, max: bounds.max }),
      abort: true,
    })
    .refine((value) => hasAtMostDecimalPlaces(value, bounds.places), {
      params: ruleParams('precision', { max: bounds.places }),
    });
}

/** List-of-ids spec. Each element must match `element` (a UUID by default). */
export function idListField(bounds: IdListBounds, element: z.ZodType<string> = z.uuid()) {
  const list = z
    .array(element)
    .refine((ids) => ids.length >= bounds.min && ids.length <= bounds.max, {
      params: ruleParams('count', { min: bounds.min, max: bounds.max }),
      abort: true,
    });
  return bounds.distinct
    ? list.refine((ids) => new Set(ids).size === ids.length, { params: ruleParams('distinct') })
    : list;
}

/** Specs for every context-free row of the validation catalogue. */
export const Fields = {
  slaDurationMinutes: integerField(FIELD_BOUNDS.slaDurationMinutes),
  confidenceThreshold: decimalField(FIELD_BOUNDS.confidenceThreshold),
  kAnonymity: integerField(FIELD_BOUNDS.kAnonymity),
  spikeClusterK: integerField(FIELD_BOUNDS.spikeClusterK),
  sessionIdleMinutes: integerField(FIELD_BOUNDS.sessionIdleMinutes),
  reason: textField(FIELD_BOUNDS.reason),
  revealReason: textField(FIELD_BOUNDS.revealReason),
  decisionRationale: textField(FIELD_BOUNDS.decisionRationale),
  internalNote: textField(FIELD_BOUNDS.internalNote),
  bulkReassignTicketIds: idListField(FIELD_BOUNDS.bulkReassignTicketIds),
  opportunityTitle: textField(FIELD_BOUNDS.opportunityTitle),
  opportunityDescription: textField(FIELD_BOUNDS.opportunityDescription),
  applicationOutcome: z.enum(FIELD_BOUNDS.applicationOutcome.values),
  copilotMessage: textField(FIELD_BOUNDS.copilotMessage),
  csatScore: integerField(FIELD_BOUNDS.csatScore),
  csatComment: textField(FIELD_BOUNDS.csatComment),
  reportFrequency: z.enum(FIELD_BOUNDS.reportFrequency.values),
  reportFormat: z.enum(FIELD_BOUNDS.reportFormat.values),
  attachmentSizeBytes: integerField(FIELD_BOUNDS.attachmentSizeBytes),
  ticketAttachmentType: z.enum(FIELD_BOUNDS.ticketAttachmentType.values),
  documentLockerAttachmentType: z.enum(FIELD_BOUNDS.documentLockerAttachmentType.values),
} as const;

export type ApplicationOutcome = z.output<typeof Fields.applicationOutcome>;
export type ReportFrequency = z.output<typeof Fields.reportFrequency>;
export type ReportFormat = z.output<typeof Fields.reportFormat>;

/** Current time for rules relative to now. */
export interface ClockContext {
  readonly now: Date;
}

/** Current time and the Tenant's IANA time zone, for rules relative to today. */
export interface TenantDateContext extends ClockContext {
  readonly timeZone: string;
}

/** Answers whether a user id belongs to a user of the Tenant in context. */
export interface TenantUserContext {
  readonly isTenantUser: (userId: string) => boolean;
}

/** Answers whether a user id belongs to an active staff user of the Tenant in context. */
export interface ActiveStaffContext {
  readonly isActiveStaffUser: (userId: string) => boolean;
}

/** Handler ETA after L1: an ISO 8601 instant with `now < eta ≤ now + 30 days` (6.4). */
export function etaField(context: ClockContext) {
  const earliest = context.now.getTime();
  const latest = earliest + ETA_MAX_DAYS_AHEAD * DAY_MS;
  return instantField().refine(
    (value) => {
      const at = parseInstant(value);
      return at !== undefined && at > earliest && at <= latest;
    },
    { params: ruleParams('window', { min: new Date(earliest).toISOString(), max: new Date(latest).toISOString() }) },
  );
}

/** Opportunity deadline: an ISO 8601 instant strictly in the future (10.10, 10.11). */
export function opportunityDeadlineField(context: ClockContext) {
  const now = context.now.getTime();
  return instantField().refine(
    (value) => {
      const at = parseInstant(value);
      return at !== undefined && at > now;
    },
    { params: ruleParams('future', { min: context.now.toISOString() }) },
  );
}

/**
 * Incident target resolution date: an ISO 8601 date not before today in the Tenant time zone (14.7, 14.8).
 *
 * @throws RangeError when `timeZone` is not a valid IANA time zone.
 */
export function incidentTargetDateField(context: TenantDateContext) {
  const today = calendarDate(context.now, context.timeZone);
  return dateField().refine((value) => parseIsoDate(value) !== undefined && value >= today, {
    params: ruleParams('not_before', { min: today }),
  });
}

/** Incident owner: the id of an active staff user (14.7, 14.8). */
export function incidentOwnerField(context: ActiveStaffContext) {
  return z.uuid().refine((userId) => context.isActiveStaffUser(userId), { params: ruleParams('active_staff') });
}

/** Report recipients: 1 to 20 user ids, each a user of the Tenant (15.2). */
export function reportRecipientsField(context: TenantUserContext) {
  const recipient = z.uuid().refine((userId) => context.isTenantUser(userId), { params: ruleParams('tenant_member') });
  return idListField(FIELD_BOUNDS.reportRecipients, recipient);
}

/** Post-closure rating: score 1 to 5 and an optional comment of up to 1,000 characters (4.8, 20.8, 20.9). */
export const csatRatingSchema = z.strictObject({
  score: Fields.csatScore,
  comment: Fields.csatComment.optional(),
});

/** Analytics period: ISO 8601 start and end dates with start ≤ end, spanning 1 to 366 days inclusive (14.1). */
export const analyticsPeriodSchema = z
  .strictObject({ start: dateField(), end: dateField() })
  .refine(
    (period) => {
      const span = periodDays(period.start, period.end);
      return span === undefined || span >= ANALYTICS_PERIOD_MIN_DAYS;
    },
    { path: ['end'], params: ruleParams('order'), abort: true },
  )
  .refine(
    (period) => {
      const span = periodDays(period.start, period.end);
      return span === undefined || span <= ANALYTICS_PERIOD_MAX_DAYS;
    },
    {
      path: ['end'],
      params: ruleParams('span', { min: ANALYTICS_PERIOD_MIN_DAYS, max: ANALYTICS_PERIOD_MAX_DAYS }),
    },
  );

/** Report schedule: frequency and format required, 1 to 20 recipients who are all users of the Tenant (15.1, 15.2). */
export function reportScheduleSchema(context: TenantUserContext) {
  return z.strictObject({
    frequency: Fields.reportFrequency,
    format: Fields.reportFormat,
    recipients: reportRecipientsField(context),
  });
}

/**
 * Opportunity submission: title, description, eligibility rules, required documents, a future deadline and a link
 * or instructions to apply (10.10, 10.11). Every invalid field is reported.
 */
export function opportunitySchema(context: ClockContext) {
  return z
    .strictObject({
      title: Fields.opportunityTitle,
      description: Fields.opportunityDescription,
      eligibilityRules: z.record(z.string(), z.unknown()),
      requiredDocuments: z.array(textField({ kind: 'text', min: 1, max: 200, trim: true })).max(50),
      deadline: opportunityDeadlineField(context),
      applyLink: z
        .string()
        .max(2048)
        .refine((v) => /^https?:\/\/\S+$/i.test(v), { params: ruleParams('format', { expected: 'url' }) })
        .optional(),
      applyInstructions: textField({ kind: 'text', min: 1, max: 5000, trim: true }).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.applyLink === undefined && value.applyInstructions === undefined) {
        ctx.addIssue({ code: 'custom', path: ['applyLink'], params: ruleParams('required') });
      }
    });
}

/** Incident record: an active staff owner and a target date not before today (14.7, 14.8). */
export function incidentSchema(context: TenantDateContext & ActiveStaffContext) {
  return z.strictObject({
    ownerId: incidentOwnerField(context),
    targetDate: incidentTargetDateField(context),
  });
}

/** ISO 8601 instant with an offset (`Z` or `+05:30`) that `Date.parse` accepts. */
function instantField() {
  return z.iso.datetime({ offset: true }).refine((value) => parseInstant(value) !== undefined, {
    params: ruleParams('format', { expected: 'datetime' }),
    abort: true,
  });
}

/** ISO 8601 calendar date (`YYYY-MM-DD`) that exists in the Gregorian calendar. */
function dateField() {
  return z.iso.date().refine((value) => parseIsoDate(value) !== undefined, {
    params: ruleParams('format', { expected: 'date' }),
    abort: true,
  });
}

function rangeDetails(min: number, max: number | undefined): RuleDetails {
  return max === undefined ? { min } : { min, max };
}

/** True when `value` is exactly the double nearest to a decimal with at most `places` decimal places. */
function hasAtMostDecimalPlaces(value: number, places: number): boolean {
  return Number(value.toFixed(places)) === value;
}

function parseInstant(value: string): number | undefined {
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at;
}

/** Milliseconds at UTC midnight of an ISO 8601 date, or `undefined` if the date does not exist. */
function parseIsoDate(value: string): number | undefined {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const at = Date.UTC(year, month - 1, day);
  const date = new Date(at);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return at;
}

/** Days from `start` to `end` counting both ends, or `undefined` if either date is invalid. */
function periodDays(start: string, end: string): number | undefined {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (from === undefined || to === undefined) {
    return undefined;
  }
  return Math.round((to - from) / DAY_MS) + 1;
}

/** The calendar date (`YYYY-MM-DD`) of `instant` in `timeZone`. */
function calendarDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}
