// Pure rules for Tenant configuration: k-anonymity thresholds (G1) and validation through the catalogue (1.6).

import {
  Fields,
  integerField,
  textField,
  validate,
  type FieldError,
  type ValidationResult,
} from '@campusconnect/contracts';
import {
  PRIORITY_BANDS,
  RATE_LIMIT_SCOPES,
  WEEKDAYS,
  type RateLimitConfig,
  type RoutingRuleInput,
  type SlaPolicyInput,
  type TenantConfig,
  type TenantConfigPatch,
  type WorkingCalendarInput,
} from './tenancy.types';

/** Floor for aggregates and exports regardless of the configured `kAnonymity` (G1, 15.4). */
export const MIN_EFFECTIVE_K = 5;

/** The k used for aggregates and exports: `max(5, kAnonymity)` (G1). */
export function effectiveK(config: Pick<TenantConfig, 'kAnonymity'>): number {
  return Math.max(MIN_EFFECTIVE_K, config.kAnonymity);
}

/**
 * The k used for spike clusters and their labels (14.5). It is validated to 3 to 20 and is not raised to the
 * aggregate floor, because it is a separate setting from `kAnonymity`.
 */
export function effectiveSpikeClusterK(config: Pick<TenantConfig, 'spikeClusterK'>): number {
  return config.spikeClusterK;
}

/** Both thresholds in one value, so callers cannot mix them up. */
export function kThresholds(config: Pick<TenantConfig, 'kAnonymity' | 'spikeClusterK'>): {
  readonly aggregateK: number;
  readonly clusterK: number;
} {
  return { aggregateK: effectiveK(config), clusterK: effectiveSpikeClusterK(config) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOCK_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;

const NAME = textField({ kind: 'text', min: 1, max: 200, trim: true });
const KEYWORD = textField({ kind: 'text', min: 1, max: 100, trim: true });
const BROADCAST_CAP = integerField({ kind: 'integer', min: 1, max: 10_000_000 });
const RATE_LIMIT = integerField({ kind: 'integer', min: 1, max: 1_000_000 });
const RATE_WINDOW = integerField({ kind: 'integer', min: 1, max: 86_400 });
const SLA_MINUTES = integerField({ kind: 'integer', min: 1, max: 525_600 });
const RANK_LIMIT = 1000;

/** Collects field errors under path prefixes. */
class Collector {
  readonly errors: FieldError[] = [];

  add(error: FieldError): void {
    if (!this.errors.some((existing) => existing.path === error.path)) this.errors.push(error);
  }

  /** Runs a catalogue schema on `value`; `path` replaces the schema's root path. */
  field(path: string, schema: Parameters<typeof validate>[0], value: unknown): unknown {
    const result = validate(schema, value);
    if (result.ok) return result.value;
    for (const error of result.errors) this.add({ ...error, path });
    return undefined;
  }

  uuid(path: string, value: unknown): void {
    if (typeof value !== 'string') this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'string' });
    else if (!UUID.test(value)) this.add({ path, rule: 'format', expected: 'uuid' });
  }

  boolean(path: string, value: unknown): void {
    if (typeof value !== 'boolean') this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'boolean' });
  }

  choice(path: string, value: unknown, allowed: readonly string[]): void {
    if (value === undefined) this.add({ path, rule: 'required' });
    else if (typeof value !== 'string' || !allowed.includes(value)) this.add({ path, rule: 'enum', allowed });
  }

  clock(path: string, value: unknown): void {
    if (typeof value !== 'string') this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'string' });
    else if (!CLOCK_TIME.test(value)) this.add({ path, rule: 'format', expected: 'HH:mm' });
  }

  timeZone(path: string, value: unknown): void {
    if (typeof value !== 'string') {
      this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'string' });
      return;
    }
    if (!isIanaTimeZone(value)) this.add({ path, rule: 'format', expected: 'iana_time_zone' });
  }

  unknownKeys(path: string, value: Record<string, unknown>, known: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) this.add({ path: path === '' ? key : `${path}.${key}`, rule: 'unknown_field' });
    }
  }

  /** An object, or a `type` error. Returns undefined when `value` is not an object. */
  object(path: string, value: unknown): Record<string, unknown> | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'object' });
    return undefined;
  }

  array(path: string, value: unknown, min: number, max: number): unknown[] | undefined {
    if (!Array.isArray(value)) {
      this.add({ path, rule: value === undefined ? 'required' : 'type', expected: 'array' });
      return undefined;
    }
    if (value.length < min || value.length > max) {
      this.add({ path, rule: 'count', min, max });
      return undefined;
    }
    return value as unknown[];
  }

  result<T>(value: T): ValidationResult<T> {
    return this.errors.length > 0 ? { ok: false, errors: this.errors } : { ok: true, value };
  }
}

export function isIanaTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const CONFIG_KEYS = [
  'timeZone',
  'region',
  'confidenceThreshold',
  'duplicateThreshold',
  'copilotConfidenceThreshold',
  'kAnonymity',
  'spikeClusterK',
  'sessionIdleMinutes',
  'smsEnabled',
  'broadcastApprovalRequired',
  'broadcastRecipientCap',
  'executiveDigest',
  'trainingLabelOptIn',
] as const satisfies readonly (keyof TenantConfig)[];

/** Validates a partial configuration update. Every invalid field is reported; nothing is saved by this function. */
export function validateTenantConfigPatch(input: unknown): ValidationResult<TenantConfigPatch> {
  const c = new Collector();
  const body = c.object('', input);
  if (body === undefined) return c.result({});
  c.unknownKeys('', body, CONFIG_KEYS);

  const patch: Record<string, unknown> = {};
  const take = (key: (typeof CONFIG_KEYS)[number], check: (value: unknown) => void): void => {
    if (body[key] === undefined) return;
    const before = c.errors.length;
    check(body[key]);
    if (c.errors.length === before) patch[key] = body[key];
  };

  take('timeZone', (v) => c.timeZone('timeZone', v));
  take('region', (v) => {
    if (typeof v !== 'string') c.add({ path: 'region', rule: 'type', expected: 'string' });
    else if (!AWS_REGION.test(v)) c.add({ path: 'region', rule: 'format', expected: 'aws_region' });
  });
  take('confidenceThreshold', (v) => c.field('confidenceThreshold', Fields.confidenceThreshold, v));
  take('duplicateThreshold', (v) => c.field('duplicateThreshold', Fields.confidenceThreshold, v));
  take('copilotConfidenceThreshold', (v) => c.field('copilotConfidenceThreshold', Fields.confidenceThreshold, v));
  take('kAnonymity', (v) => c.field('kAnonymity', Fields.kAnonymity, v));
  take('spikeClusterK', (v) => c.field('spikeClusterK', Fields.spikeClusterK, v));
  take('sessionIdleMinutes', (v) => c.field('sessionIdleMinutes', Fields.sessionIdleMinutes, v));
  take('smsEnabled', (v) => c.boolean('smsEnabled', v));
  take('broadcastApprovalRequired', (v) => c.boolean('broadcastApprovalRequired', v));
  take('broadcastRecipientCap', (v) => c.field('broadcastRecipientCap', BROADCAST_CAP, v));
  take('trainingLabelOptIn', (v) => c.boolean('trainingLabelOptIn', v));
  take('executiveDigest', (v) => {
    const digest = c.object('executiveDigest', v);
    if (digest === undefined) return;
    c.unknownKeys('executiveDigest', digest, ['weekday', 'time']);
    if (!(WEEKDAYS as readonly unknown[]).includes(digest['weekday'])) {
      c.add(
        digest['weekday'] === undefined
          ? { path: 'executiveDigest.weekday', rule: 'required' }
          : { path: 'executiveDigest.weekday', rule: 'range', min: 1, max: 7 },
      );
    }
    c.clock('executiveDigest.time', digest['time']);
  });

  return c.result(patch as TenantConfigPatch);
}

export function validateName(path: string, input: unknown): ValidationResult<string> {
  const c = new Collector();
  const value = c.field(path, NAME, input);
  return c.result(value as string);
}

export function validateUuid(path: string, input: unknown): ValidationResult<string> {
  const c = new Collector();
  c.uuid(path, input);
  return c.result(input as string);
}

export function validateBand(path: string, input: unknown): ValidationResult<(typeof PRIORITY_BANDS)[number]> {
  const c = new Collector();
  c.choice(path, input, PRIORITY_BANDS);
  return c.result(input as (typeof PRIORITY_BANDS)[number]);
}

export function validateBoolean(path: string, input: unknown): ValidationResult<boolean> {
  const c = new Collector();
  c.boolean(path, input);
  return c.result(input as boolean);
}

export function validateDutyRoster(input: unknown): ValidationResult<readonly { userId: string; onDuty: boolean }[]> {
  const c = new Collector();
  const list = c.array('', input, 0, 1000);
  const entries: { userId: string; onDuty: boolean }[] = [];
  list?.forEach((item, index) => {
    const row = c.object(`${index}`, item);
    if (row === undefined) return;
    c.unknownKeys(`${index}`, row, ['userId', 'onDuty']);
    c.uuid(`${index}.userId`, row['userId']);
    c.boolean(`${index}.onDuty`, row['onDuty']);
    entries.push({ userId: row['userId'] as string, onDuty: row['onDuty'] as boolean });
  });
  if (list !== undefined && new Set(entries.map((entry) => entry.userId)).size !== entries.length) {
    c.add({ path: '', rule: 'distinct' });
  }
  return c.result(entries);
}

export function validateRoutingRules(input: unknown): ValidationResult<readonly RoutingRuleInput[]> {
  const c = new Collector();
  const list = c.array('', input, 0, RANK_LIMIT);
  const rules: RoutingRuleInput[] = [];
  list?.forEach((item, index) => {
    const prefix = `${index}`;
    const row = c.object(prefix, item);
    if (row === undefined) return;
    c.unknownKeys(prefix, row, ['categoryId', 'keywords', 'departmentId']);
    c.uuid(`${prefix}.categoryId`, row['categoryId']);
    c.uuid(`${prefix}.departmentId`, row['departmentId']);
    const keywords = c.array(`${prefix}.keywords`, row['keywords'], 1, 50);
    const cleaned: string[] = [];
    keywords?.forEach((keyword, k) => {
      const value = c.field(`${prefix}.keywords.${k}`, KEYWORD, keyword);
      if (typeof value === 'string') cleaned.push(value);
    });
    rules.push({
      categoryId: row['categoryId'] as string,
      departmentId: row['departmentId'] as string,
      keywords: cleaned,
    });
  });
  return c.result(rules);
}

export function validateSlaPolicy(input: unknown): ValidationResult<SlaPolicyInput> {
  const c = new Collector();
  const row = c.object('', input);
  if (row === undefined) return c.result(undefined as never);
  c.unknownKeys('', row, ['band', 'categoryId', 'firstResponseMin', 'resolutionMin', 'l1Min', 'l2Min']);
  c.choice('band', row['band'], PRIORITY_BANDS);
  if (row['categoryId'] !== undefined) c.uuid('categoryId', row['categoryId']);
  for (const key of ['firstResponseMin', 'resolutionMin', 'l1Min', 'l2Min'] as const) {
    c.field(key, SLA_MINUTES, row[key]);
  }
  return c.result({
    band: row['band'] as SlaPolicyInput['band'],
    categoryId: row['categoryId'] as string | undefined,
    firstResponseMin: row['firstResponseMin'] as number,
    resolutionMin: row['resolutionMin'] as number,
    l1Min: row['l1Min'] as number,
    l2Min: row['l2Min'] as number,
  });
}

export function validateWorkingCalendar(input: unknown): ValidationResult<WorkingCalendarInput> {
  const c = new Collector();
  const body = c.object('', input);
  if (body === undefined) return c.result(undefined as never);
  c.unknownKeys('', body, ['timeZone', 'weekly', 'holidays']);
  c.timeZone('timeZone', body['timeZone']);

  const weekly: Record<number, { start: string; end: string }[]> = {};
  const week = c.object('weekly', body['weekly']);
  if (week !== undefined) {
    c.unknownKeys('weekly', week, WEEKDAYS.map(String));
    for (const day of WEEKDAYS) {
      const raw = week[String(day)];
      if (raw === undefined) continue;
      const path = `weekly.${day}`;
      const windows = c.array(path, raw, 0, 4);
      const kept: { start: string; end: string }[] = [];
      windows?.forEach((item, index) => {
        const prefix = `${path}.${index}`;
        const window = c.object(prefix, item);
        if (window === undefined) return;
        c.unknownKeys(prefix, window, ['start', 'end']);
        c.clock(`${prefix}.start`, window['start']);
        c.clock(`${prefix}.end`, window['end']);
        const { start, end } = window as { start: string; end: string };
        if (CLOCK_TIME.test(String(start)) && CLOCK_TIME.test(String(end))) {
          if (end <= start) c.add({ path: `${prefix}.end`, rule: 'order' });
          else kept.push({ start, end });
        }
      });
      kept.sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < kept.length; i++) {
        if (kept[i]!.start < kept[i - 1]!.end) c.add({ path: `${path}.${i}.start`, rule: 'order' });
      }
      weekly[day] = kept;
    }
  }

  const dates = c.array('holidays', body['holidays'], 0, 400);
  const holidays: string[] = [];
  dates?.forEach((item, index) => {
    const path = `holidays.${index}`;
    if (typeof item !== 'string') c.add({ path, rule: 'type', expected: 'string' });
    else if (!isIsoDate(item)) c.add({ path, rule: 'format', expected: 'date' });
    else holidays.push(item);
  });
  if (dates !== undefined && new Set(holidays).size !== holidays.length) c.add({ path: 'holidays', rule: 'distinct' });

  return c.result({
    timeZone: body['timeZone'] as string,
    weekly: weekly as WorkingCalendarInput['weekly'],
    holidays: [...holidays].sort(),
  });
}

function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateRateLimit(input: unknown): ValidationResult<RateLimitConfig> {
  const c = new Collector();
  const row = c.object('', input);
  if (row === undefined) return c.result(undefined as never);
  c.unknownKeys('', row, ['scope', 'limit', 'windowSec']);
  c.choice('scope', row['scope'], RATE_LIMIT_SCOPES);
  c.field('limit', RATE_LIMIT, row['limit']);
  c.field('windowSec', RATE_WINDOW, row['windowSec']);
  return c.result({
    scope: row['scope'] as RateLimitConfig['scope'],
    limit: row['limit'] as number,
    windowSec: row['windowSec'] as number,
  });
}
