// Ports and types for the SLA_Engine module.

/** Why a Ticket has no running SLA clock (6.12). */
export type SlaUnconfiguredReason = 'calendar_missing' | 'no_working_time' | 'policy_missing';

/** Tells the Tenant_Admin a Ticket was flagged `slaUnconfigured`. The notification module implements it. */
export interface SlaNotifier {
  slaUnconfigured(notice: { tenantId: string; ticketId: string; reason: SlaUnconfiguredReason }): Promise<void>;
}

/** Timer kinds this module owns. `triage_deadline` belongs to Ticket creation and is only cancelled on routing. */
export const SLA_TIMER_KINDS = [
  'at_risk',
  'l1',
  'l2',
  'l3',
  'l3_review_due',
  'awaiting_student_7d',
  'confirmation_window_end',
] as const;

export const AWAITING_STUDENT_STATUS = 'Awaiting Student';
export const RESOLVED_STATUS = 'Resolved (Pending Confirmation)';
export const CLOSED_STATUS = 'Closed';
export const REOPENED_STATUS = 'Reopened';

/** Queue that receives the events this module consumes (see `EVENT_QUEUES`). */
export const SLA_QUEUE = 'sla';
