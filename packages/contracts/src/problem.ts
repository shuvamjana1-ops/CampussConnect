/**
 * RFC 9457 problem details. Every API error is `application/problem+json` built only from an error code,
 * field paths and fixed extension members. Problems never echo user text or PII (19.6).
 */
import { ERROR_CATALOGUE, type ErrorCode } from './error-codes';
import type { FieldError } from './validate';

export const PROBLEM_JSON_MEDIA_TYPE = 'application/problem+json';

/** Base of the problem `type` URI; the error code is appended. */
export const PROBLEM_TYPE_BASE_URI = 'https://campusconnect.app/errors/';

/** Reasons carried by `ATTACHMENT_REJECTED` (3.15, 3.16, 12.10). */
export const ATTACHMENT_REJECTION_REASONS = ['TOO_LARGE', 'TYPE_NOT_ALLOWED', 'LIMIT_REACHED', 'MALWARE_DETECTED'] as const;

export type AttachmentRejectionReason = (typeof ATTACHMENT_REJECTION_REASONS)[number];

/** One Ticket that blocked a bulk reassignment, with the code of its failure (7.9). */
export interface BulkReassignFailure {
  readonly ticketId: string;
  readonly code: ErrorCode;
}

/** Extension members required for specific error codes. Codes not listed here have none. */
export interface ProblemExtensionsByCode {
  readonly VALIDATION_FAILED: { readonly fields: readonly FieldError[] };
  readonly ACCOUNT_LOCKED: { readonly unlockAt: string };
  readonly ATTACHMENT_REJECTED: { readonly reason: AttachmentRejectionReason };
  readonly BULK_REASSIGN_FAILED: { readonly failures: readonly BulkReassignFailure[] };
  readonly RATE_LIMITED: { readonly retryAfterSeconds: number };
}

export type ProblemExtensions<C extends ErrorCode> = C extends keyof ProblemExtensionsByCode
  ? ProblemExtensionsByCode[C]
  : Record<never, never>;

/** RFC 9457 members plus the CampusConnect `code` and `requestId` members. */
export interface ProblemBase<C extends ErrorCode> {
  /** `PROBLEM_TYPE_BASE_URI` followed by the code. */
  readonly type: string;
  /** Fixed title of the code. */
  readonly title: string;
  /** HTTP status of the code. */
  readonly status: number;
  readonly code: C;
  readonly requestId: string;
  /** URI reference of the failing request, when the API sets one. */
  readonly instance?: string;
}

/** The problem for one error code. */
export type ProblemOf<C extends ErrorCode> = ProblemBase<C> & ProblemExtensions<C>;

/** Any CampusConnect problem, discriminated by `code`. */
export type ProblemDetails = { [C in ErrorCode]: ProblemOf<C> }[ErrorCode];

/** Members the caller supplies when building a problem. */
export type ProblemInit<C extends ErrorCode> = { readonly requestId: string; readonly instance?: string } & ProblemExtensions<C>;

export function problemTypeUri(code: ErrorCode): string {
  return `${PROBLEM_TYPE_BASE_URI}${code}`;
}

/** Builds the problem for `code`, taking status and title from the error catalogue. */
export function problem<C extends ErrorCode>(code: C, init: ProblemInit<C>): ProblemOf<C> {
  const { status, title } = ERROR_CATALOGUE[code];
  return { type: problemTypeUri(code), title, status, code, ...init };
}

/** `VALIDATION_FAILED` problem listing every invalid field (1.6, 22.4). */
export function validationProblem(fields: readonly FieldError[], requestId: string): ProblemOf<'VALIDATION_FAILED'> {
  return problem('VALIDATION_FAILED', { requestId, fields });
}
