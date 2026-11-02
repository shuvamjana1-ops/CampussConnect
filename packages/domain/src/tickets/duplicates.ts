// Duplicate candidate selection (3.10, 3.11). Pure: the similarity score is supplied by the caller.
import type { UserId } from '../types';
import type { TicketStatus } from './state-machine';

/** The fields of a Ticket the duplicate check needs. */
export interface DuplicateCheckTicket {
  readonly reporterId: UserId;
  readonly status: TicketStatus;
}

/** A Ticket is open until it is Closed. */
export function isOpenTicket(status: TicketStatus): boolean {
  return status !== 'Closed';
}

/**
 * Returns the Student's own open Tickets whose similarity to the new text is at or above the threshold,
 * in their original order. `similarity` scores one Ticket against the new text.
 */
export function selectDuplicates<T extends DuplicateCheckTicket>(
  studentId: UserId,
  tickets: readonly T[],
  similarity: (ticket: T) => number,
  threshold: number,
): T[] {
  return tickets.filter(
    (ticket) =>
      ticket.reporterId === studentId && isOpenTicket(ticket.status) && similarity(ticket) >= threshold,
  );
}
