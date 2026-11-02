// P0 notification of on-duty Dept_Heads and the Ombudsperson (5.7). Three retries 30 s apart, then `escalationFailed`.

import { P0_ESCALATION_POLICY, executeWithRetry, type RetryPolicy } from '@campusconnect/domain/retry';
import { useTenant, type OutboxDatabase } from '../outbox/outbox.types';
import type { TriageNotificationService } from './triage.types';

export interface P0EscalatorOptions {
  readonly policy?: RetryPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class P0Escalator {
  private readonly policy: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly db: OutboxDatabase,
    private readonly notifications: TriageNotificationService,
    options: P0EscalatorOptions = {},
  ) {
    this.policy = options.policy ?? P0_ESCALATION_POLICY;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Call after the routing transaction commits. Never throws: a failure is recorded as `escalationFailed`. */
  async escalate(tenantId: string, ticketId: string, departmentId: string | null): Promise<void> {
    const recipients = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const found = await tx.query<{ user_id: string }>(`SELECT user_id::text FROM triage.p0_recipients($1::uuid)`, [
        departmentId,
      ]);
      return [...new Set(found.rows.map((r) => r.user_id))];
    });

    let failed = recipients.length === 0;
    for (const userId of recipients) {
      const outcome = await executeWithRetry(
        this.policy,
        () =>
          this.notifications.send({
            tenantId,
            userId,
            event: 'p0_escalation',
            params: { ticketId, departmentId },
          }),
        { sleep: this.sleep },
      );
      if (!outcome.ok) failed = true;
    }
    if (!failed) return;
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(`SELECT triage.set_flag($1::uuid, 'escalationFailed', true)`, [ticketId]);
    });
  }
}
