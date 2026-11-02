// Versioned domain events written to the transactional outbox and delivered through SQS.
// Every event carries `type` and `version`. A breaking change to a payload adds a new version; consumers
// dispatch on the pair, so old and new versions can be in flight together.

import { z } from 'zod';

const uuid = z.string().uuid();

/** Fields common to every event. `id` is the outbox row id and the idempotency key for consumers. */
const envelopeShape = {
  id: uuid,
  tenantId: uuid,
  occurredAt: z.number().int().nonnegative(),
};

function defineEvent<Type extends string, Version extends number, Shape extends z.ZodRawShape>(
  type: Type,
  version: Version,
  payload: Shape,
) {
  return z.object({
    ...envelopeShape,
    type: z.literal(type),
    version: z.literal(version),
    payload: z.object(payload),
  });
}

export const ticketCreatedV1 = defineEvent('TicketCreated', 1, {
  ticketId: uuid,
  studentId: uuid,
});

export const ticketRoutedV1 = defineEvent('TicketRouted', 1, {
  ticketId: uuid,
  departmentId: uuid,
});

export const ticketStatusChangedV1 = defineEvent('TicketStatusChanged', 1, {
  ticketId: uuid,
  fromStatus: z.string().min(1).max(64),
  toStatus: z.string().min(1).max(64),
  actorId: uuid.nullable(),
});

export const ticketAssignmentChangedV1 = defineEvent('TicketAssignmentChanged', 1, {
  ticketId: uuid,
  assigneeId: uuid.nullable(),
});

export const ticketPriorityChangedV1 = defineEvent('TicketPriorityChanged', 1, {
  ticketId: uuid,
  fromBand: z.string().min(1).max(8),
  toBand: z.string().min(1).max(8),
});

export const grievanceDecisionRecordedV1 = defineEvent('GrievanceDecisionRecorded', 1, {
  ticketId: uuid,
  decision: z.string().min(1).max(64),
});

export const opportunityPublishedV1 = defineEvent('OpportunityPublished', 1, {
  opportunityId: uuid,
});

/** An Opportunity's deadline passed and it was marked Expired (10.13). */
export const opportunityExpiredV1 = defineEvent('OpportunityExpired', 1, {
  opportunityId: uuid,
});

/** The Ticket reached 75% of its resolution budget (6.3). The Handler is told. */
export const slaAtRiskV1 = defineEvent('SlaAtRisk', 1, {
  ticketId: uuid,
  assigneeId: uuid.nullable(),
  dueAt: z.number().int().nonnegative(),
});

/** L1 breach (6.4). The Student gets the interim ETA; the Handler must set an ETA (G7). */
export const slaBreachedV1 = defineEvent('SlaBreached', 1, {
  ticketId: uuid,
  studentId: uuid,
  assigneeId: uuid.nullable(),
  interimEta: z.number().int().nonnegative().nullable(),
  etaRequired: z.boolean(),
});

/** An escalation level was reached (6.5 to 6.7), or the L3 review passed its deadline (8.4). */
export const ticketEscalatedV1 = defineEvent('TicketEscalated', 1, {
  ticketId: uuid,
  level: z.number().int().min(1).max(3),
  targetRole: z.enum(['handler', 'dept_head', 'ombudsperson']),
  targetUserId: uuid.nullable(),
  reason: z.enum(['threshold', 'ombudsperson_overdue']),
  reviewDueAt: z.number().int().nonnegative().nullable(),
});

/** ERP synchronisation changed a Student record (17.5, 17.9). */
export const erpStudentChangedV1 = defineEvent('ErpStudentChanged', 1, {
  studentId: uuid,
  externalId: z.string().min(1).max(128),
  enrolmentStatus: z.enum(['active', 'inactive']),
  changedFields: z.array(z.string().min(1).max(64)).max(32),
});

/** A user completed sign-in (2.1). Feeds the activity facts; carries the role class only, no profile data. */
export const userSignedInV1 = defineEvent('UserSignedIn', 1, {
  userId: uuid,
  roleClass: z.enum(['student', 'staff']),
  firstSignIn: z.boolean(),
});

/** A Student profile changed (10.6, 10.7). Triggers embedding regeneration and re-matching. */
export const profileChangedV1 = defineEvent('ProfileChanged', 1, {
  studentId: uuid,
  changedFields: z.array(z.string().min(1).max(64)).max(64),
});

export const domainEventSchema = z.discriminatedUnion('type', [
  profileChangedV1,
  ticketCreatedV1,
  ticketRoutedV1,
  ticketStatusChangedV1,
  ticketAssignmentChangedV1,
  ticketPriorityChangedV1,
  grievanceDecisionRecordedV1,
  opportunityPublishedV1,
  opportunityExpiredV1,
  slaAtRiskV1,
  slaBreachedV1,
  ticketEscalatedV1,
  erpStudentChangedV1,
  userSignedInV1,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent['type'];
export type DomainEventOf<Type extends DomainEventType> = Extract<DomainEvent, { type: Type }>;
/** The part of an event the producer supplies; the outbox assigns `id` and `occurredAt`. */
export type DomainEventDraft = {
  [Type in DomainEventType]: Pick<DomainEventOf<Type>, 'type' | 'version' | 'tenantId' | 'payload'>;
}[DomainEventType];

/** Queue that receives each event type. */
export const EVENT_QUEUES: Readonly<Record<DomainEventType, readonly string[]>> = {
  TicketCreated: ['triage', 'notify', 'analytics'],
  TicketRouted: ['sla', 'notify', 'analytics'],
  TicketStatusChanged: ['sla', 'notify', 'analytics'],
  TicketAssignmentChanged: ['sla', 'notify'],
  TicketPriorityChanged: ['sla', 'analytics'],
  GrievanceDecisionRecorded: ['notify'],
  OpportunityPublished: ['match', 'embed', 'notify'],
  OpportunityExpired: ['match'],
  SlaAtRisk: ['notify'],
  SlaBreached: ['notify', 'analytics'],
  TicketEscalated: ['notify', 'analytics'],
  UserSignedIn: ['analytics'],
  ProfileChanged: ['embed', 'match'],
  // Consumed through the outbox by later modules; no queue subscribes yet.
  ErpStudentChanged: [],
};

/** A due timer delivered to the `timers` queue. Handlers ignore it when `generation` is older than the row's. */
export const timerMessageSchema = z.object({
  tenantId: uuid,
  ticketId: uuid,
  kind: z.string().min(1).max(64),
  generation: z.number().int().nonnegative(),
  dueAt: z.number().int().nonnegative(),
});
export type TimerMessage = z.infer<typeof timerMessageSchema>;
