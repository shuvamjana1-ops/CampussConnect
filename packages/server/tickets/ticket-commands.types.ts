// Types and errors for Ticket commands, messages and views (task 15.7; requirements 3.14, 3.15, 4.x, 6.4, 17.9).

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import type { RejectionCode } from '@campusconnect/domain/tickets';
import type { PriorityBand } from '../tenancy';

export const BAND_REASON_MAX_LENGTH = 500;
export const INTERNAL_NOTE_MAX_LENGTH = 5_000;
export const PUBLIC_MESSAGE_MAX_LENGTH = 20_000;
/** An ETA may be at most this far ahead of now (6.4). */
export const MAX_ETA_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

export const DOMAIN_COMMAND_TYPES = [
  'assign',
  'start',
  'await_student',
  'student_respond',
  'resume',
  'resolve',
  'confirm',
  'dispute',
  'withdraw',
  'reopen',
] as const;
export const EXTRA_COMMAND_TYPES = ['change_band', 'set_eta'] as const;
export const COMMAND_TYPES = [...DOMAIN_COMMAND_TYPES, ...EXTRA_COMMAND_TYPES] as const;
export type TicketCommandName = (typeof COMMAND_TYPES)[number];

/** The body of `POST /tickets/{id}/commands`. */
export interface TicketCommandInput {
  readonly type: TicketCommandName;
  readonly reason?: string;
  readonly assigneeId?: string;
  readonly rating?: number;
  readonly band?: PriorityBand;
  /** UTC milliseconds. */
  readonly eta?: number;
}

export interface TicketCommandResult {
  readonly ticketId: string;
  readonly status: string;
  readonly band: PriorityBand;
  readonly assigneeId: string | null;
  readonly eta: number | null;
  /** The new version, to send as the next `If-Match`. */
  readonly version: number;
}

export type MessageVisibility = 'public' | 'internal';

export interface PostMessageInput {
  readonly visibility: MessageVisibility;
  readonly body: string;
}

export interface PostMessageResult {
  readonly messageId: string;
  readonly visibility: MessageVisibility;
  readonly firstPublicResponse: boolean;
  readonly createdAt: number;
}

export interface TicketListItem {
  readonly id: string;
  readonly ref: string;
  readonly type: string;
  readonly title: string;
  readonly status: string;
  readonly band: PriorityBand;
  readonly department: { readonly id: string; readonly name: string } | null;
  readonly firstResponseDueAt: number | null;
  readonly resolutionDueAt: number | null;
  readonly eta: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TicketHistoryItem {
  readonly at: number;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly reason: string;
  readonly kind: string;
}

export interface ListOptions {
  readonly limit?: number;
  /** Offset into the list, newest first. */
  readonly offset?: number;
}

/** Maps a state-machine rejection to an error code. */
const REJECTION_CODES: Readonly<Record<RejectionCode, string>> = {
  TICKET_CLOSED: ErrorCode.TICKET_CLOSED,
  CONFIRMATION_WINDOW_ENDED: ErrorCode.CONFIRMATION_WINDOW_ENDED,
  INVALID_TRANSITION: ErrorCode.INVALID_TRANSITION,
  ACTOR_NOT_PERMITTED: ErrorCode.INSUFFICIENT_PERMISSION,
  INVALID_REASON: ErrorCode.VALIDATION_FAILED,
  INVALID_RATING: ErrorCode.VALIDATION_FAILED,
};

export type TicketCommandErrorCode =
  | typeof ErrorCode.TICKET_CLOSED
  | typeof ErrorCode.CONFIRMATION_WINDOW_ENDED
  | typeof ErrorCode.INVALID_TRANSITION
  | typeof ErrorCode.VERSION_CONFLICT
  | typeof ErrorCode.ETA_REQUIRED
  | typeof ErrorCode.INSUFFICIENT_PERMISSION
  | typeof ErrorCode.ACCESS_DENIED
  | typeof ErrorCode.VALIDATION_FAILED;

/** A command or message that was refused. Nothing has been saved. */
export class TicketCommandError extends Error {
  constructor(
    readonly code: TicketCommandErrorCode,
    readonly fields?: readonly FieldError[],
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TicketCommandError';
  }

  get status(): number {
    return httpStatusOf(this.code);
  }

  static fromRejection(code: RejectionCode, field?: string): TicketCommandError {
    const mapped = REJECTION_CODES[code] as TicketCommandErrorCode;
    const fields: FieldError[] | undefined =
      mapped === ErrorCode.VALIDATION_FAILED
        ? [code === 'INVALID_RATING' ? { path: 'rating', rule: 'invalid' } : { path: field ?? 'reason', rule: 'length', min: 1, max: BAND_REASON_MAX_LENGTH }]
        : undefined;
    return new TicketCommandError(mapped, fields);
  }
}

/** Maps a Ticket command error to its code and HTTP status, or `undefined` for errors that are not ours. */
export function toTicketCommandProblem(
  error: unknown,
): { readonly code: TicketCommandErrorCode; readonly status: number; readonly fields?: readonly FieldError[] } | undefined {
  if (!(error instanceof TicketCommandError)) return undefined;
  return { code: error.code, status: error.status, ...(error.fields === undefined ? {} : { fields: error.fields }) };
}
