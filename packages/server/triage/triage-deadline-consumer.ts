// `triage_deadline` watchdog (G6): a Ticket still New 30 seconds after creation stays New with `pendingManualTriage`.

import type { TimerMessage } from '@campusconnect/contracts';
import { TimerConsumer, type MessageResult, type QueueConsumerOptions } from '../outbox/queue-consumer';
import type { OutboxDatabase, OutboxSqlClient, QueueClient } from '../outbox/outbox.types';
import type { P0Escalator } from './p0-escalation';
import { TRIAGE_DEADLINE_KIND } from './triage.types';

export class TriageDeadlineConsumer extends TimerConsumer {
  readonly consumer = 'triage.deadline';

  private readonly pending = new Map<string, { ticketId: string; departmentId: string | null }>();

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly escalator: P0Escalator,
    options: QueueConsumerOptions = {},
  ) {
    super(db, client, options);
  }

  override async process(body: string): Promise<MessageResult> {
    const result = await super.process(body);
    const decoded = this.decode(body);
    const escalation = this.pending.get(decoded.eventId);
    this.pending.delete(decoded.eventId);
    if (result === 'applied' && escalation !== undefined) {
      await this.escalator.escalate(decoded.tenantId, escalation.ticketId, escalation.departmentId);
    }
    return result;
  }

  protected async handle(tx: OutboxSqlClient, timer: TimerMessage): Promise<void> {
    if (timer.kind !== TRIAGE_DEADLINE_KIND) return;
    const marked = await tx.query<{ marked: boolean }>(`SELECT triage.mark_pending_manual($1::uuid) AS marked`, [
      timer.ticketId,
    ]);
    if (marked.rows[0]?.marked !== true) return;

    // A P0 Ticket that cannot be triaged still reaches the on-duty Dept_Heads and the Ombudsperson (5.7).
    const facts = await tx.query<{ band: string; category_dept: string | null }>(
      `SELECT f.band, c.default_department_id::text AS category_dept
       FROM triage.ticket_for_triage($1::uuid) f
       LEFT JOIN core.categories c ON c.tenant_id = $2::uuid AND c.id = f.category_id`,
      [timer.ticketId, timer.tenantId],
    );
    const row = facts.rows[0];
    if (row?.band !== 'P0') return;
    const fallback = await tx.query<{ department_id: string | null }>(
      `SELECT default_department_id::text AS department_id FROM core.tenant_config WHERE tenant_id = $1::uuid`,
      [timer.tenantId],
    );
    this.pending.set(`${timer.ticketId}:${timer.kind}:${timer.generation}`, {
      ticketId: timer.ticketId,
      departmentId: row.category_dept ?? fallback.rows[0]?.department_id ?? null,
    });
  }
}
