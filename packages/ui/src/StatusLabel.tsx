import { Badge, type BadgeTone } from './Badge.js';

export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'inProgress'
  | 'awaitingStudent'
  | 'resolvedPending'
  | 'closed'
  | 'reopened';

export type SlaState = 'atRisk' | 'breached';

export type StatusKind = TicketStatus | SlaState;

interface StatusStyle {
  readonly tone: BadgeTone;
  readonly icon: string;
  /** English text used when no localised label is supplied. */
  readonly defaultLabel: string;
}

export const statusStyles: Readonly<Record<StatusKind, StatusStyle>> = {
  new: { tone: 'info', icon: '●', defaultLabel: 'New' },
  assigned: { tone: 'info', icon: '→', defaultLabel: 'Assigned' },
  inProgress: { tone: 'info', icon: '◐', defaultLabel: 'In Progress' },
  awaitingStudent: { tone: 'warning', icon: '⏸', defaultLabel: 'Awaiting Student' },
  resolvedPending: { tone: 'success', icon: '✓', defaultLabel: 'Resolved (Pending Confirmation)' },
  closed: { tone: 'neutral', icon: '■', defaultLabel: 'Closed' },
  reopened: { tone: 'warning', icon: '↺', defaultLabel: 'Reopened' },
  atRisk: { tone: 'warning', icon: '⚠', defaultLabel: 'At risk' },
  breached: { tone: 'danger', icon: '✖', defaultLabel: 'Breached' },
};

export interface StatusLabelProps {
  readonly status: StatusKind;
  /** Localised text; the status is always shown as text plus icon, never colour alone. */
  readonly label?: string;
}

export function StatusLabel({ status, label }: StatusLabelProps) {
  const style = statusStyles[status];
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {label ?? style.defaultLabel}
    </Badge>
  );
}
