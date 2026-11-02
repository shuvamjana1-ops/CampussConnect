// Types and errors for the Staff_Workbench API (task 18.6; requirements 7.1 to 7.6, 7.12, 7.13, 25.5, 25.6).

import { ErrorCode, httpStatusOf, type BulkReassignFailure, type FieldError } from '@campusconnect/contracts';
import type { PriorityBand } from '../tenancy';

export { QUEUE_PAGE_SIZE } from '@campusconnect/domain/workbench';

export const CANNED_TITLE_MAX_LENGTH = 100;
export const CANNED_BODY_MAX_LENGTH = 5_000;
export const SUMMARY_TIMEOUT_MS = 3_000;
export const SUMMARY_MAX_TOKENS = 300;
/** Rolling window for the AI override rate (7.5). */
export const OVERRIDE_WINDOW_DAYS = 30;

export type QueueLane = 'mine' | 'needs_verification';

export interface QueueQuery {
  readonly lane?: QueueLane;
  /** Opaque keyset cursor from the previous page. */
  readonly cursor?: string;
}

export interface QueueItemView {
  readonly id: string;
  readonly ref: string;
  readonly type: string;
  readonly title: string;
  readonly status: string;
  readonly band: PriorityBand;
  /** The anonymous reference replaces the Student's identity on confidential Grievances (7.10). */
  readonly confidential: boolean;
  readonly anonRef: string | null;
  readonly departmentId: string | null;
  readonly assigneeId: string | null;
  readonly sortDueAt: number | null;
  readonly createdAt: number;
  readonly paused: boolean;
  /** "At risk" label (7.2). */
  readonly atRisk: boolean;
  /** "Breached" label (7.2). */
  readonly breached: boolean;
  readonly escalationFailed: boolean;
  readonly needsVerification: boolean;
}

export interface QueuePage {
  readonly items: readonly QueueItemView[];
  /** Null on the last page. */
  readonly nextCursor: string | null;
  /** Open Tickets in the Needs_Verification_Lane the actor can see (7.3). */
  readonly needsVerificationCount: number;
}

export interface TriageCorrectionInput {
  readonly categoryId?: string;
  readonly band?: PriorityBand;
  readonly departmentId?: string;
  readonly reason?: string;
}

export interface TriageActionResult {
  readonly ticketId: string;
  readonly categoryId: string;
  readonly band: PriorityBand;
  readonly departmentId: string | null;
  readonly assigneeId: string | null;
  readonly version: number;
}

export interface OverrideRateRow {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly suggestions: number;
  readonly corrected: number;
  /** Corrected suggestions divided by suggestions; 0 when there are none. */
  readonly rate: number;
}

export interface CannedReply {
  readonly id: string;
  readonly departmentId: string | null;
  readonly title: string;
  readonly body: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CannedReplyInput {
  readonly title: string;
  readonly body: string;
  readonly departmentId?: string | null;
}

export type SummaryResult =
  | { readonly summary: string; readonly label: 'AI-suggested' }
  | { readonly unavailable: true };

export const BULK_REASSIGN_MIN = 2;
export const BULK_REASSIGN_MAX = 100;

export interface BulkReassignInput {
  readonly ticketIds: readonly string[];
  readonly assigneeId: string;
  readonly reason: string;
}

export interface BulkReassignResult {
  readonly assigneeId: string;
  readonly reassigned: readonly { readonly ticketId: string; readonly fromAssigneeId: string | null }[];
}

/** A bulk reassignment that was rejected whole; lists each failing Ticket with its reason code (7.9). */
export class BulkReassignFailedError extends Error {
  readonly code = ErrorCode.BULK_REASSIGN_FAILED;

  constructor(readonly failures: readonly BulkReassignFailure[]) {
    super(ErrorCode.BULK_REASSIGN_FAILED);
    this.name = 'BulkReassignFailedError';
  }

  get status(): number {
    return httpStatusOf(this.code);
  }
}

export type WorkbenchErrorCode =
  | typeof ErrorCode.VALIDATION_FAILED
  | typeof ErrorCode.INSUFFICIENT_PERMISSION
  | typeof ErrorCode.ACCESS_DENIED
  | typeof ErrorCode.TICKET_CLOSED;

/** A Workbench request that was refused. Nothing has been saved. */
export class WorkbenchError extends Error {
  constructor(
    readonly code: WorkbenchErrorCode,
    readonly fields?: readonly FieldError[],
  ) {
    super(code);
    this.name = 'WorkbenchError';
  }

  get status(): number {
    return httpStatusOf(this.code);
  }
}

export function toWorkbenchProblem(
  error: unknown,
):
  | {
      readonly code: WorkbenchErrorCode | typeof ErrorCode.BULK_REASSIGN_FAILED;
      readonly status: number;
      readonly fields?: readonly FieldError[];
      readonly failures?: readonly BulkReassignFailure[];
    }
  | undefined {
  if (error instanceof BulkReassignFailedError) {
    return { code: error.code, status: error.status, failures: error.failures };
  }
  if (!(error instanceof WorkbenchError)) return undefined;
  return { code: error.code, status: error.status, ...(error.fields === undefined ? {} : { fields: error.fields }) };
}
