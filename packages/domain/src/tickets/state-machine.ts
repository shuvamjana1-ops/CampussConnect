// Ticket state machine (4.1, 4.2, 4.7 to 4.14; G9, G16). Pure: no I/O, never mutates its inputs.
import type { Role } from '../rbac';
import type { DepartmentId, Instant, TicketId, UserId } from '../types';
import { instant } from '../types';

export const TICKET_STATUSES = [
  'New',
  'Assigned',
  'In Progress',
  'Awaiting Student',
  'Resolved (Pending Confirmation)',
  'Closed',
  'Reopened',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CONFIRMATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Share of the original SLA budgets given to a disputed or reopened Ticket (4.10, G16). */
export const REOPEN_SLA_BUDGET_FACTOR = 0.5;
export const MAX_REASON_LENGTH = 500;

export type ClosureReason = 'Withdrawn' | 'Confirmed' | 'AutoConfirmed';
export type OwnerLevel = 'handler' | 'dept_head';

export interface Ticket {
  readonly id: TicketId;
  readonly reporterId: UserId;
  readonly departmentId: DepartmentId;
  readonly status: TicketStatus;
  readonly assigneeId: UserId | null;
  readonly ownerLevel: OwnerLevel;
  /** The user who last marked the Ticket resolved; a dispute must go to someone else (4.10). */
  readonly resolverId: UserId | null;
  /** When the Ticket entered Resolved (Pending Confirmation); null otherwise. */
  readonly resolvedAt: Instant | null;
  readonly closureReason: ClosureReason | null;
  readonly autoConfirmed: boolean;
  readonly rating: number | null;
  /** Multiplier on every original SLA budget: 1, or 0.5 after a dispute or reopen. */
  readonly slaBudgetFactor: number;
}

export type Actor =
  | { readonly kind: 'system' }
  | { readonly kind: 'user'; readonly userId: UserId; readonly roles: readonly Role[] };

/** An active Handler of the Ticket's department, with the number of open Tickets assigned (G9). */
export interface HandlerCandidate {
  readonly userId: UserId;
  readonly openTicketCount: number;
}

export type TicketCommand =
  | { readonly type: 'assign'; readonly assigneeId: UserId; readonly reason?: string }
  | { readonly type: 'start'; readonly reason?: string }
  | { readonly type: 'await_student'; readonly reason?: string }
  | { readonly type: 'student_respond'; readonly reason?: string }
  | { readonly type: 'resume'; readonly reason?: string }
  | { readonly type: 'resolve'; readonly reason?: string }
  | { readonly type: 'confirm'; readonly rating: number }
  | { readonly type: 'window_expired' }
  | {
      readonly type: 'dispute';
      readonly reason: string;
      /** Active Handlers of the department, including the previous resolver if still active. */
      readonly handlers: readonly HandlerCandidate[];
      readonly deptHeadId: UserId;
    }
  | { readonly type: 'withdraw' }
  | { readonly type: 'reopen'; readonly reason: string };

export type CommandType = TicketCommand['type'];

type ActorClass = 'system' | 'reporter' | 'handler' | 'dept_head' | 'ombudsperson';

export interface TransitionRule {
  readonly command: CommandType;
  readonly from: readonly TicketStatus[];
  readonly to: TicketStatus;
  readonly actors: readonly ActorClass[];
  /** Reason recorded in history when the command carries none. */
  readonly fixedReason: string;
  readonly sla: SlaEffect;
}

export type SlaEffect = 'start' | 'pause' | 'resume' | 'stop' | 'restart_reduced' | 'none';

const NON_CLOSED: readonly TicketStatus[] = TICKET_STATUSES.filter((s) => s !== 'Closed');
const RESOLVED = 'Resolved (Pending Confirmation)';

/** The transition table as data (design, State machine). */
export const TRANSITIONS: readonly TransitionRule[] = [
  { command: 'assign', from: ['New'], to: 'Assigned', actors: ['system', 'handler', 'dept_head'], fixedReason: 'Assigned', sla: 'start' },
  { command: 'start', from: ['Assigned', 'Reopened'], to: 'In Progress', actors: ['handler'], fixedReason: 'Work started', sla: 'none' },
  { command: 'await_student', from: ['Assigned', 'In Progress', 'Reopened'], to: 'Awaiting Student', actors: ['handler'], fixedReason: 'Waiting for the Student', sla: 'pause' },
  { command: 'student_respond', from: ['Awaiting Student'], to: 'In Progress', actors: ['reporter'], fixedReason: 'Student responded', sla: 'resume' },
  { command: 'resume', from: ['Awaiting Student'], to: 'In Progress', actors: ['handler'], fixedReason: 'Handler resumed work', sla: 'resume' },
  { command: 'resolve', from: ['Assigned', 'In Progress', 'Awaiting Student', 'Reopened'], to: RESOLVED, actors: ['handler', 'dept_head'], fixedReason: 'Marked resolved', sla: 'stop' },
  { command: 'confirm', from: [RESOLVED], to: 'Closed', actors: ['reporter'], fixedReason: 'Resolution confirmed by the Student', sla: 'none' },
  { command: 'window_expired', from: [RESOLVED], to: 'Closed', actors: ['system'], fixedReason: 'Auto-confirmed after 7 days', sla: 'none' },
  { command: 'dispute', from: [RESOLVED], to: 'Reopened', actors: ['reporter'], fixedReason: 'Disputed', sla: 'restart_reduced' },
  { command: 'withdraw', from: NON_CLOSED, to: 'Closed', actors: ['reporter'], fixedReason: 'Withdrawn', sla: 'stop' },
  { command: 'reopen', from: ['Closed'], to: 'Reopened', actors: ['dept_head', 'ombudsperson'], fixedReason: 'Reopened', sla: 'restart_reduced' },
];

export type Rejection =
  | { readonly code: 'TICKET_CLOSED' }
  | { readonly code: 'CONFIRMATION_WINDOW_ENDED' }
  | { readonly code: 'INVALID_TRANSITION' }
  | { readonly code: 'ACTOR_NOT_PERMITTED' }
  | { readonly code: 'INVALID_REASON' }
  | { readonly code: 'INVALID_RATING' };
export type RejectionCode = Rejection['code'];

export interface HistoryEntry {
  readonly ticketId: TicketId;
  /** null for system actors. */
  readonly actorId: UserId | null;
  /** UTC, second precision (4.2). */
  readonly at: Instant;
  readonly fromStatus: TicketStatus;
  readonly toStatus: TicketStatus;
  /** 1 to 500 characters. */
  readonly reason: string;
}

export type TicketEvent =
  | {
      readonly type: 'TicketStatusChanged';
      readonly ticketId: TicketId;
      readonly from: TicketStatus;
      readonly to: TicketStatus;
      readonly at: Instant;
      readonly sla: SlaEffect;
      /** Set with `restart_reduced`: the share of each original SLA budget. */
      readonly slaBudgetFactor: number | null;
    }
  | {
      readonly type: 'TicketAssigned';
      readonly ticketId: TicketId;
      readonly assigneeId: UserId;
      readonly ownerLevel: OwnerLevel;
      readonly at: Instant;
    };

export type CommandResult =
  | {
      readonly ok: true;
      readonly ticket: Ticket;
      readonly events: readonly TicketEvent[];
      readonly historyEntry: HistoryEntry;
    }
  | { readonly ok: false; readonly rejection: Rejection };

const reject = (code: RejectionCode): CommandResult => ({ ok: false, rejection: { code } });

function actorHas(actor: Actor, cls: ActorClass, ticket: Ticket): boolean {
  if (cls === 'system') return actor.kind === 'system';
  if (actor.kind !== 'user') return false;
  if (cls === 'reporter') return actor.userId === ticket.reporterId && actor.roles.includes('student');
  return actor.roles.includes(cls);
}

/** The least-loaded active Handler other than the previous resolver, else the Dept_Head (G9). Ties break by id. */
export function chooseDisputeAssignee(
  handlers: readonly HandlerCandidate[],
  previousResolverId: UserId | null,
  deptHeadId: UserId,
): { readonly assigneeId: UserId; readonly ownerLevel: OwnerLevel } {
  let best: HandlerCandidate | undefined;
  for (const h of handlers) {
    if (h.userId === previousResolverId) continue;
    if (
      best === undefined ||
      h.openTicketCount < best.openTicketCount ||
      (h.openTicketCount === best.openTicketCount && h.userId < best.userId)
    ) {
      best = h;
    }
  }
  // The Ticket is assigned "at Dept_Head level" (4.10): the Dept_Head owns it even when a Handler works it.
  return { assigneeId: best?.userId ?? deptHeadId, ownerLevel: 'dept_head' };
}

/** The first moment at which a Student can no longer confirm or dispute. */
export function confirmationDeadline(resolvedAt: Instant): Instant {
  return instant(resolvedAt + CONFIRMATION_WINDOW_MS);
}

const toSecond = (at: Instant): Instant => instant(Math.floor(at / 1000) * 1000);

function validReason(reason: string): boolean {
  return reason.length >= 1 && reason.length <= MAX_REASON_LENGTH;
}

/**
 * Applies one command. Returns the new Ticket with its events and one history entry, or a typed rejection.
 * The input Ticket is never mutated, and a rejection changes nothing.
 */
export function applyCommand(ticket: Ticket, command: TicketCommand, actor: Actor, now: Instant): CommandResult {
  const rule = TRANSITIONS.find((r) => r.command === command.type);
  if (rule === undefined) return reject('INVALID_TRANSITION');

  if (ticket.status === 'Closed') {
    // Only a Dept_Head or Ombudsperson reopening may act on a Closed Ticket (4.13).
    if (command.type !== 'reopen' || !rule.actors.some((cls) => actorHas(actor, cls, ticket))) {
      return reject('TICKET_CLOSED');
    }
  } else if (!rule.from.includes(ticket.status)) {
    return reject('INVALID_TRANSITION');
  }

  if (!rule.actors.some((cls) => actorHas(actor, cls, ticket))) return reject('ACTOR_NOT_PERMITTED');

  const inWindow = ticket.resolvedAt !== null && now < confirmationDeadline(ticket.resolvedAt);
  if (command.type === 'confirm' || command.type === 'dispute') {
    if (!inWindow) return reject('CONFIRMATION_WINDOW_ENDED');
  }
  if (command.type === 'window_expired' && inWindow) return reject('INVALID_TRANSITION');

  let reason = rule.fixedReason;
  if ('reason' in command && command.reason !== undefined) {
    if (!validReason(command.reason)) return reject('INVALID_REASON');
    reason = command.reason;
  }
  if (command.type === 'confirm' && (!Number.isInteger(command.rating) || command.rating < 1 || command.rating > 5)) {
    return reject('INVALID_RATING');
  }

  const events: TicketEvent[] = [];
  const at = toSecond(now);
  let next: Ticket = { ...ticket, status: rule.to };
  const actorUserId = actor.kind === 'user' ? actor.userId : null;

  switch (command.type) {
    case 'assign':
      next = { ...next, assigneeId: command.assigneeId, ownerLevel: 'handler' };
      events.push({ type: 'TicketAssigned', ticketId: ticket.id, assigneeId: command.assigneeId, ownerLevel: 'handler', at });
      break;
    case 'resolve':
      next = { ...next, resolvedAt: now, resolverId: actorUserId };
      break;
    case 'confirm':
      next = { ...next, resolvedAt: null, rating: command.rating, closureReason: 'Confirmed', autoConfirmed: false };
      break;
    case 'window_expired':
      next = { ...next, resolvedAt: null, closureReason: 'AutoConfirmed', autoConfirmed: true };
      break;
    case 'withdraw':
      next = { ...next, resolvedAt: null, closureReason: 'Withdrawn' };
      break;
    case 'dispute': {
      if (!validReason(command.reason)) return reject('INVALID_REASON');
      reason = command.reason;
      const pick = chooseDisputeAssignee(command.handlers, ticket.resolverId, command.deptHeadId);
      next = {
        ...next,
        assigneeId: pick.assigneeId,
        ownerLevel: pick.ownerLevel,
        resolvedAt: null,
        slaBudgetFactor: REOPEN_SLA_BUDGET_FACTOR,
      };
      events.push({ type: 'TicketAssigned', ticketId: ticket.id, assigneeId: pick.assigneeId, ownerLevel: pick.ownerLevel, at });
      break;
    }
    case 'reopen':
      if (!validReason(command.reason)) return reject('INVALID_REASON');
      reason = command.reason;
      next = {
        ...next,
        resolvedAt: null,
        closureReason: null,
        autoConfirmed: false,
        rating: null,
        slaBudgetFactor: REOPEN_SLA_BUDGET_FACTOR,
      };
      break;
    default:
      break;
  }

  events.unshift({
    type: 'TicketStatusChanged',
    ticketId: ticket.id,
    from: ticket.status,
    to: rule.to,
    at,
    sla: rule.sla,
    slaBudgetFactor: rule.sla === 'restart_reduced' ? REOPEN_SLA_BUDGET_FACTOR : null,
  });

  const historyEntry: HistoryEntry = {
    ticketId: ticket.id,
    actorId: actorUserId,
    at,
    fromStatus: ticket.status,
    toStatus: rule.to,
    reason,
  };
  return { ok: true, ticket: next, events, historyEntry };
}

/** A new Ticket in status New with default SLA budgets. */
export function newTicket(input: { id: TicketId; reporterId: UserId; departmentId: DepartmentId }): Ticket {
  return {
    id: input.id,
    reporterId: input.reporterId,
    departmentId: input.departmentId,
    status: 'New',
    assigneeId: null,
    ownerLevel: 'handler',
    resolverId: null,
    resolvedAt: null,
    closureReason: null,
    autoConfirmed: false,
    rating: null,
    slaBudgetFactor: 1,
  };
}
