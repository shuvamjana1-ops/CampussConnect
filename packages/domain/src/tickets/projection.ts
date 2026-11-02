// Viewer projection (3.8, 7.10, 7.11, 8.1, 8.2, 8.7). Pure: hides the reporter identity of confidential
// Grievances and internal notes from Students. Never mutates its inputs.
import { randomInt } from 'crypto';
import type { Role } from '../rbac';
import type { TicketId, UserId } from '../types';

export const TICKET_VIEW_KINDS = ['queue', 'detail', 'search', 'notification'] as const;
export type TicketViewKind = (typeof TICKET_VIEW_KINDS)[number];

export const ANON_REF_LENGTH = 8;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 8 random base32 characters (for example 7F3K9Q2A). Uniqueness per Tenant is enforced by a constraint. */
export function generateAnonRef(): string {
  let ref = '';
  for (let i = 0; i < ANON_REF_LENGTH; i += 1) ref += BASE32_ALPHABET[randomInt(BASE32_ALPHABET.length)];
  return ref;
}

export interface ReporterIdentity {
  readonly name: string;
  readonly email: string;
  readonly studentId: string;
}

export interface TicketMessage {
  readonly id: string;
  readonly body: string;
  readonly internal: boolean;
}

/** The fields of a Ticket that the projection reads; extra fields pass through to authorised viewers. */
export interface ProjectableTicket {
  readonly id: TicketId;
  readonly reporterId: UserId;
  readonly confidential: boolean;
  /** Present on confidential Grievances. */
  readonly anonRef: string | null;
  readonly reporter: ReporterIdentity;
  readonly messages: readonly TicketMessage[];
}

export interface TicketViewer {
  readonly userId: UserId;
  readonly roles: readonly Role[];
}

/** A confidential_reveals record: the Ombudsperson revealed the Grievance's reporter to a named Handler (8.2). */
export interface RevealRecord {
  readonly ticketId: TicketId;
  readonly handlerId: UserId;
}

export type ProjectedTicket<T extends ProjectableTicket> = Omit<T, 'reporter' | 'messages'> & {
  /** Present only when the viewer may see the identity. */
  readonly reporter: ReporterIdentity | null;
  /** The pseudonym shown in place of the identity when it is hidden; null otherwise. */
  readonly reporterRef: string | null;
  readonly messages: readonly TicketMessage[];
  readonly view: TicketViewKind;
};

/** True when the viewer may see the reporter identity of the Ticket. */
export function canSeeReporterIdentity(
  ticket: Pick<ProjectableTicket, 'id' | 'reporterId' | 'confidential'>,
  viewer: TicketViewer,
  reveals: readonly RevealRecord[],
): boolean {
  if (!ticket.confidential) return true;
  if (viewer.userId === ticket.reporterId) return true;
  if (viewer.roles.includes('ombudsperson')) return true;
  return reveals.some((r) => r.ticketId === ticket.id && r.handlerId === viewer.userId);
}

/**
 * Projects a Ticket for a viewer in the queue, detail, search or notification view. Hidden identities are
 * replaced by the Grievance's anonRef, and internal notes are removed from Student views.
 */
export function projectTicketForViewer<T extends ProjectableTicket>(
  ticket: T,
  viewer: TicketViewer,
  reveals: readonly RevealRecord[],
  view: TicketViewKind = 'detail',
): ProjectedTicket<T> {
  const visible = canSeeReporterIdentity(ticket, viewer, reveals);
  const isStudentView = viewer.roles.length > 0 && viewer.roles.every((r) => r === 'student');
  // Internal notes are hidden from Student views, and from the reporter whatever other roles they hold.
  const hideNotes = isStudentView || viewer.userId === ticket.reporterId;
  const { reporter, ...rest } = ticket;
  return {
    ...rest,
    reporter: visible ? { ...reporter } : null,
    reporterRef: visible ? null : ticket.anonRef,
    messages: ticket.messages.filter((m) => !hideNotes || !m.internal),
    view,
  };
}
