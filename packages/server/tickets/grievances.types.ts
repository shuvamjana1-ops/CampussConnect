// Types and errors for confidentiality and Grievance Committee endpoints (task 15.8; requirements 3.8, 8.1 to 8.8).

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';

export const REVEAL_REASON_MIN_LENGTH = 10;
export const REVEAL_REASON_MAX_LENGTH = 500;
export const DECISION_RATIONALE_MIN_LENGTH = 20;
export const DECISION_RATIONALE_MAX_LENGTH = 5_000;
export const DECISION_MAX_LENGTH = 64;
/** The decision label stored when the caller names none. */
export const DEFAULT_DECISION = 'recorded';

/** The body of `POST /grievances/{id}/reveals`. */
export interface RevealInput {
  /** The Handler who may see the reporter's identity. */
  readonly handlerId: string;
  readonly reason: string;
}

export interface RevealResult {
  readonly ticketId: string;
  readonly handlerId: string;
  /** UTC milliseconds. */
  readonly at: number;
}

/** The body of `POST /grievances/{id}/decision`. */
export interface DecisionInput {
  readonly rationale: string;
  /** A short label such as `upheld`; defaults to `recorded`. */
  readonly decision?: string;
}

export interface DecisionResult {
  readonly ticketId: string;
  readonly decision: string;
  readonly at: number;
}

export interface L3GrievanceItem {
  readonly id: string;
  readonly ref: string;
  /** Shown to staff instead of the reporter's identity for confidential Grievances. */
  readonly anonRef: string | null;
  readonly title: string;
  readonly status: string;
  readonly band: string;
  readonly escalatedAt: number | null;
  readonly reviewDueAt: number | null;
  /** Null when the Tenant has no usable working calendar or the escalation time is unknown. */
  readonly workingDaysRemaining: number | null;
  /** True once no Working Days remain (8.4). */
  readonly overdue: boolean;
}

export interface ReporterIdentity {
  readonly ticketId: string;
  readonly name: string;
  readonly email: string;
  readonly studentId: string;
}

export type GrievanceErrorCode =
  | typeof ErrorCode.ACCESS_DENIED
  | typeof ErrorCode.INSUFFICIENT_PERMISSION
  | typeof ErrorCode.VALIDATION_FAILED
  | typeof ErrorCode.INVALID_TRANSITION
  | typeof ErrorCode.AUDIT_UNAVAILABLE
  | typeof ErrorCode.DEPENDENCY_DEGRADED;

/** A Grievance request that was refused. Nothing has been saved and no identity was revealed. */
export class GrievanceError extends Error {
  constructor(
    readonly code: GrievanceErrorCode,
    readonly fields?: readonly FieldError[],
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GrievanceError';
  }

  get status(): number {
    return httpStatusOf(this.code);
  }
}

/** Maps a Grievance error to its code and HTTP status, or `undefined` for errors that are not ours. */
export function toGrievanceProblem(
  error: unknown,
): { readonly code: GrievanceErrorCode; readonly status: number; readonly fields?: readonly FieldError[] } | undefined {
  if (!(error instanceof GrievanceError)) return undefined;
  return { code: error.code, status: error.status, ...(error.fields === undefined ? {} : { fields: error.fields }) };
}
