import { isActorRef, type ActorRef } from './actor-ref';
import {
  isDurationMs,
  isErrorCode,
  isHttpStatus,
  isRequestIdValue,
  isRouteTemplate,
  isTenantIdValue,
  normalizeTenantId,
} from './validation';

/**
 * The only fields a log line can carry (25.1, 19.6). Every field is an identifier, a code or a number, so free
 * text such as names, email addresses, Ticket content or error messages has nowhere to go.
 */
export interface LogFields {
  /** Platform-generated request id (ULID or UUID). */
  readonly requestId?: string;
  /** Tenant id (UUID) or `NO_TENANT`. */
  readonly tenantId?: string;
  /** Route template such as `/api/v1/tickets/:id`. Raw paths are rejected because they can contain ids. */
  readonly route?: string;
  /** HTTP status code. */
  readonly status?: number;
  readonly durationMs?: number;
  /** Error code from the Error Handling catalogue, such as `VALIDATION_FAILED`. */
  readonly errorCode?: string;
  /** Pseudonymous user reference from `createActorRefHasher`. Never the user id itself. */
  readonly actorRef?: ActorRef;
}

export type LogFieldName = keyof LogFields;

type LogFieldValue = string | number;

/** One check per allowlisted field. The `Record` type makes the compiler reject a field without a check. */
const LOG_FIELD_CHECKS: Readonly<Record<LogFieldName, (value: unknown) => boolean>> = {
  requestId: isRequestIdValue,
  tenantId: isTenantIdValue,
  route: isRouteTemplate,
  status: isHttpStatus,
  durationMs: isDurationMs,
  errorCode: isErrorCode,
  actorRef: isActorRef,
};

/** The allowlisted field names. */
export const LOG_FIELD_NAMES: readonly LogFieldName[] = Object.freeze(Object.keys(LOG_FIELD_CHECKS) as LogFieldName[]);

export interface SanitizedLogFields {
  /** Allowlisted fields whose values passed their check. */
  readonly fields: Readonly<Partial<Record<LogFieldName, LogFieldValue>>>;
  /** Allowlisted field names whose values failed their check. Values are never echoed. */
  readonly invalidFields: readonly LogFieldName[];
  /** How many fields outside the allowlist were dropped. Their names are not echoed because a key can hold PII. */
  readonly droppedFieldCount: number;
}

function isLogFieldName(key: string): key is LogFieldName {
  return Object.hasOwn(LOG_FIELD_CHECKS, key);
}

/**
 * Keeps only allowlisted fields with valid values. Accepts `unknown` because the compiler's excess-property
 * check does not cover every call (spread objects, untyped callers), so this runtime filter is the guarantee.
 * Fields set to `undefined` are ignored.
 */
export function sanitizeLogFields(input: unknown): SanitizedLogFields {
  const fields: Partial<Record<LogFieldName, LogFieldValue>> = {};
  const invalidFields: LogFieldName[] = [];
  let droppedFieldCount = 0;
  if (typeof input !== 'object' || input === null) {
    return { fields, invalidFields, droppedFieldCount };
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined) {
      continue;
    }
    if (!isLogFieldName(key)) {
      droppedFieldCount += 1;
      continue;
    }
    if (!LOG_FIELD_CHECKS[key](value)) {
      invalidFields.push(key);
      continue;
    }
    fields[key] = key === 'tenantId' ? normalizeTenantId(value as string) : (value as LogFieldValue);
  }
  return { fields, invalidFields, droppedFieldCount };
}
