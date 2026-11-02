import type { z } from 'zod';

/**
 * Rules reported in a {@link FieldError}. Each rule says which bound a field broke:
 *
 * - `required`: the field is missing.
 * - `type`: the value has the wrong JSON type (`expected` names the type).
 * - `format`: the string is not in the expected format (`expected` is, for example, `uuid`, `date` or `datetime`).
 * - `unknown_field`: the field is not part of the schema. Request schemas reject unknown fields.
 * - `characters`: the text contains a disallowed character (U+0000, which PostgreSQL text cannot store).
 * - `length`: the text length is outside `min`..`max` code points after NFC normalisation (and trimming where the field trims).
 * - `integer`: the number is not a whole number within the safe-integer range.
 * - `range`: the number is outside `min`..`max` inclusive. `max` is absent when there is no upper bound.
 * - `precision`: the number has more than `max` decimal places.
 * - `enum`: the value is not one of `allowed`.
 * - `count`: the number of items is outside `min`..`max`.
 * - `distinct`: the list contains the same item more than once.
 * - `future`: the instant is not strictly after `min` (the current time).
 * - `window`: the instant is not strictly after `min` and at or before `max`.
 * - `not_before`: the date is before `min`.
 * - `order`: the end of a range is before its start.
 * - `span`: the range covers fewer than `min` or more than `max` days, counting both ends.
 * - `tenant_member`: the user is not a user of the Tenant.
 * - `active_staff`: the user is not an active staff user.
 * - `invalid`: any other failure.
 */
export const VALIDATION_RULES = [
  'required',
  'type',
  'format',
  'unknown_field',
  'characters',
  'length',
  'integer',
  'range',
  'precision',
  'enum',
  'count',
  'distinct',
  'future',
  'window',
  'not_before',
  'order',
  'span',
  'tenant_member',
  'active_staff',
  'invalid',
] as const;

export type ValidationRule = (typeof VALIDATION_RULES)[number];

/** A numeric bound, or an ISO 8601 date or instant for time rules. */
export type Bound = number | string;

/** One invalid field, built only from the field path, the rule and the bounds. It never contains the submitted value. */
export interface FieldError {
  /** Dot-separated path with array indices as numbers, for example `recipients.3`. The root value has path `''`. */
  readonly path: string;
  readonly rule: ValidationRule;
  readonly min?: Bound;
  readonly max?: Bound;
  readonly allowed?: readonly string[];
  readonly expected?: string;
}

/** Bounds and hints attached to a rule. */
export interface RuleDetails {
  readonly min?: Bound;
  readonly max?: Bound;
  readonly allowed?: readonly string[];
  readonly expected?: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

/**
 * `params` for a custom Zod issue (`.refine(fn, { params: ruleParams(...) })`) so that {@link validate}
 * reports the issue with this rule and these bounds.
 */
export function ruleParams(rule: ValidationRule, details: RuleDetails = {}): Record<string, unknown> {
  return { rule, ...details };
}

/**
 * Validates `input` against `schema`. On success returns the parsed value (text NFC-normalised, and trimmed
 * where the field trims). On failure returns every invalid field path with its rule and bounds (22.4), one
 * entry per path, in the order Zod reports them. Callers persist nothing when the result is not `ok`.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, errors: fieldErrorsFrom(result.error.issues, input) };
}

/**
 * Converts Zod issues into field errors, keeping the first issue for each path.
 * `input` is the value that was parsed; it is used only to tell a missing field from a wrong type.
 */
export function fieldErrorsFrom(issues: readonly z.core.$ZodIssue[], input: unknown): FieldError[] {
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    for (const error of issueToFieldErrors(issue, input)) {
      if (!seen.has(error.path)) {
        seen.add(error.path);
        errors.push(error);
      }
    }
  }
  return errors;
}

function issueToFieldErrors(issue: z.core.$ZodIssue, input: unknown): FieldError[] {
  const path = formatPath(issue.path);
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((key): FieldError => ({ path: joinPath(path, key), rule: 'unknown_field' }));
    case 'invalid_type':
      if (valueAt(input, issue.path) === undefined) {
        return [{ path, rule: 'required' }];
      }
      return [{ path, rule: 'type', expected: issue.expected }];
    case 'invalid_value':
      if (valueAt(input, issue.path) === undefined) {
        return [{ path, rule: 'required' }];
      }
      return [{ path, rule: 'enum', allowed: issue.values.map((value) => String(value)) }];
    case 'invalid_format':
      return [{ path, rule: 'format', expected: issue.format }];
    case 'too_small':
      return [{ path, rule: sizeRule(issue.origin), min: Number(issue.minimum) }];
    case 'too_big':
      return [{ path, rule: sizeRule(issue.origin), max: Number(issue.maximum) }];
    case 'custom':
      return [customFieldError(path, issue.params)];
    default:
      return [{ path, rule: 'invalid' }];
  }
}

/** Rule for Zod's built-in size checks, so schemas that use `.min()` or `.max()` still report a catalogue rule. */
function sizeRule(origin: string): ValidationRule {
  if (origin === 'string') {
    return 'length';
  }
  return origin === 'array' || origin === 'set' ? 'count' : 'range';
}

function customFieldError(path: string, params: unknown): FieldError {
  if (!isRecord(params)) {
    return { path, rule: 'invalid' };
  }
  const { rule, min, max, allowed, expected } = params;
  if (!isValidationRule(rule)) {
    return { path, rule: 'invalid' };
  }
  return {
    path,
    rule,
    ...(isBound(min) ? { min } : {}),
    ...(isBound(max) ? { max } : {}),
    ...(isStringArray(allowed) ? { allowed } : {}),
    ...(typeof expected === 'string' ? { expected } : {}),
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.map((key) => (typeof key === 'symbol' ? (key.description ?? '') : String(key))).join('.');
}

function joinPath(base: string, key: string): string {
  return base === '' ? key : `${base}.${key}`;
}

/** The value at `path` inside `root`, or `undefined` when any step is missing. Only own properties are followed. */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current = root;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key)) {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidationRule(value: unknown): value is ValidationRule {
  return typeof value === 'string' && (VALIDATION_RULES as readonly string[]).includes(value);
}

function isBound(value: unknown): value is Bound {
  return typeof value === 'number' || typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && (value as unknown[]).every((item) => typeof item === 'string');
}
