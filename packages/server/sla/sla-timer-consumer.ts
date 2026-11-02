// Threshold and escalation handlers for the `timers` queue (6.3 to 6.7, 8.4): At_Risk, L1 to L3 and the L3 review
// deadline. Each handler is idempotent: the Ticket's flags and escalation level only move forward, so a redelivered
// or re-armed timer finds nothing left to do. Effects and outbox events commit with the `processed_events` row.

import type { TimerMessage } from '@campusconnect/contracts';
import type { Instant } from '@campusconnect/domain/types';
import {
  enqueueEvent,
  TimerConsumer,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import type { SlaEngine } from './sla-engine';

interface EscalationRow {
  applied: boolean;
  reporter_id: string | null;
  assignee_id: string | null;
  eta: Date | string | null;
  target_user_id: string | null;
}

interface OverdueRow {
  applied: boolean;
  target_user_id: string | null;
}

type TargetRole = 'handler' | 'dept_head' | 'ombudsperson';

const LEVEL_BY_KIND: Readonly<Record<string, 1 | 2 | 3>> = { l1: 1, l2: 2, l3: 3 };
const TARGET_BY_LEVEL: Readonly<Record<1 | 2 | 3, TargetRole>> = { 1: 'handler', 2: 'dept_head', 3: 'ombudsperson' };

export interface SlaTimerConsumerOptions extends QueueConsumerOptions {
  readonly now?: () => number;
}

export class SlaTimerConsumer extends TimerConsumer {
  readonly consumer = 'sla.thresholds';

  private readonly now: () => number;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly engine: SlaEngine,
    options: SlaTimerConsumerOptions = {},
  ) {
    super(db, client, options);
    this.now = options.now ?? Date.now;
  }

  protected async handle(tx: OutboxSqlClient, timer: TimerMessage): Promise<void> {
    switch (timer.kind) {
      case 'at_risk':
        return this.atRisk(tx, timer);
      case 'l1':
      case 'l2':
      case 'l3':
        return this.escalate(tx, timer, LEVEL_BY_KIND[timer.kind] ?? 1);
      case 'l3_review_due':
        return this.ombudspersonOverdue(tx, timer);
      default:
        return; // Another consumer owns this kind.
    }
  }

  /** 75% of the resolution budget: flag At_Risk and tell the Handler (6.3). */
  private async atRisk(tx: OutboxSqlClient, timer: TimerMessage): Promise<void> {
    const changed = await tx.query<{ changed: boolean }>('SELECT sla.set_ticket_flag($1::uuid, $2, true) AS changed', [
      timer.ticketId,
      'atRisk',
    ]);
    if (changed.rows[0]?.changed !== true) return;
    const facts = await tx.query<{ assignee_id: string | null }>('SELECT assignee_id FROM sla.ticket_facts($1::uuid)', [
      timer.ticketId,
    ]);
    await enqueueEvent(
      tx,
      {
        type: 'SlaAtRisk',
        version: 1,
        tenantId: timer.tenantId,
        payload: { ticketId: timer.ticketId, assigneeId: facts.rows[0]?.assignee_id ?? null, dueAt: timer.dueAt },
      },
      this.now,
    );
  }

  /** L1 breach (6.4), L2 to the Dept_Head (6.5) and L3 to the Ombudsperson (6.6, 6.7). */
  private async escalate(tx: OutboxSqlClient, timer: TimerMessage, level: 1 | 2 | 3): Promise<void> {
    const result = await tx.query<EscalationRow>('SELECT * FROM sla.apply_escalation($1::uuid, $2::smallint)', [
      timer.ticketId,
      level,
    ]);
    const row = result.rows[0];
    if (row === undefined || !row.applied || row.reporter_id === null) return;

    const escalatedAt = this.now() as Instant;
    const reviewDueAt = level === 3 ? await this.engine.markL3Escalated(tx, timer.tenantId, timer.ticketId, escalatedAt) : null;
    const role = TARGET_BY_LEVEL[level];
    await tx.query(
      `INSERT INTO sla.escalations (tenant_id, ticket_id, level, escalated_at, target_role, target_user_id, review_due_at)
       VALUES ($1::uuid, $2::uuid, $3::smallint, to_timestamp($4::double precision / 1000.0), $5, $6::uuid,
               CASE WHEN $7::double precision IS NULL THEN NULL ELSE to_timestamp($7::double precision / 1000.0) END)
       ON CONFLICT (tenant_id, ticket_id, level, escalated_at) DO NOTHING`,
      [timer.tenantId, timer.ticketId, level, escalatedAt, role, row.target_user_id ?? row.assignee_id, reviewDueAt],
    );

    if (level === 1) {
      const interimEta = row.eta === null ? await this.engine.interimEta(tx, timer.tenantId, timer.ticketId) : new Date(row.eta).getTime();
      await enqueueEvent(
        tx,
        {
          type: 'SlaBreached',
          version: 1,
          tenantId: timer.tenantId,
          payload: {
            ticketId: timer.ticketId,
            studentId: row.reporter_id,
            assigneeId: row.assignee_id,
            interimEta,
            // The Handler must set an ETA when none exists (G7).
            etaRequired: row.eta === null,
          },
        },
        this.now,
      );
    }
    await enqueueEvent(
      tx,
      {
        type: 'TicketEscalated',
        version: 1,
        tenantId: timer.tenantId,
        payload: {
          ticketId: timer.ticketId,
          level,
          targetRole: role,
          targetUserId: row.target_user_id ?? (level === 1 ? row.assignee_id : null),
          reason: 'threshold',
          reviewDueAt,
        },
      },
      this.now,
    );
  }

  /** 10 Working_Days at L3 without a decision: flag `ombudspersonOverdue` and notify the Dept_Head (8.4). */
  private async ombudspersonOverdue(tx: OutboxSqlClient, timer: TimerMessage): Promise<void> {
    const result = await tx.query<OverdueRow>('SELECT applied, target_user_id FROM sla.mark_ombudsperson_overdue($1::uuid)', [
      timer.ticketId,
    ]);
    const row = result.rows[0];
    if (row === undefined || !row.applied) return;
    await enqueueEvent(
      tx,
      {
        type: 'TicketEscalated',
        version: 1,
        tenantId: timer.tenantId,
        payload: {
          ticketId: timer.ticketId,
          level: 3,
          targetRole: 'dept_head',
          targetUserId: row.target_user_id,
          reason: 'ombudsperson_overdue',
          reviewDueAt: timer.dueAt,
        },
      },
      this.now,
    );
  }
}
