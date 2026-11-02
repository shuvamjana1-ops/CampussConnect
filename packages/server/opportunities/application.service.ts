// Applications and deadline reminders (requirements 12.1, 12.5, 12.6, 12.7).

import { dueReminders, OUTCOME_VALUES, setOutcome, setState, type ApplicationState, type OutcomeValue, type ReminderKind } from '@campusconnect/domain/applications';
import { useTenant, type OutboxDatabase } from '../outbox';
import type { OpportunityActor } from './opportunity.types';

export const APPLICATION_REMINDER_CADENCE_MS = 15 * 60_000;

export interface ApplicationRecord {
  readonly id: string;
  readonly opportunityId: string;
  readonly state: ApplicationState;
  readonly outcome: OutcomeValue | null;
}

/** Invalid state or outcome. Carries the allowed values; the previous state is retained (12.5, 12.6). */
export class ApplicationValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(readonly field: 'state' | 'outcome', readonly allowed: readonly string[]) {
    super(`Invalid ${field}. Allowed values: ${allowed.join(', ')}.`);
    this.name = 'ApplicationValidationError';
  }
}

export class ApplicationNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor() {
    super('Application not found.');
    this.name = 'ApplicationNotFoundError';
  }
}

export interface ReminderDelivery {
  readonly tenantId: string;
  readonly studentId: string;
  readonly applicationId: string;
  readonly opportunityId: string;
  readonly kind: ReminderKind;
}

export interface ApplicationServiceOptions {
  readonly database: OutboxDatabase;
  /** Delivers one reminder through the notification pipeline. */
  readonly deliver: (reminder: ReminderDelivery) => Promise<void>;
  readonly now?: () => number;
}

interface AppRow {
  id: string;
  opportunity_id: string;
  state: ApplicationState;
  outcome: OutcomeValue | null;
}

const toRecord = (r: AppRow): ApplicationRecord => ({
  id: r.id,
  opportunityId: r.opportunity_id,
  state: r.state,
  outcome: r.outcome,
});

const COLUMNS = `id::text AS id, opportunity_id::text AS opportunity_id, state, outcome`;

export class ApplicationService {
  private readonly now: () => number;

  constructor(private readonly options: ApplicationServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Saves (or returns the existing) application for the actor and an Opportunity. */
  async save(actor: OpportunityActor, opportunityId: string): Promise<ApplicationRecord> {
    const { tenantId, userId } = actor.principal;
    return this.options.database.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `INSERT INTO opps.applications (tenant_id, student_id, opportunity_id)
         VALUES (app.tenant(), $1::uuid, $2::uuid)
         ON CONFLICT (tenant_id, student_id, opportunity_id) DO NOTHING`,
        [userId, opportunityId],
      );
      const r = await tx.query<AppRow>(
        `SELECT ${COLUMNS} FROM opps.applications
          WHERE tenant_id = app.tenant() AND student_id = $1::uuid AND opportunity_id = $2::uuid`,
        [userId, opportunityId],
      );
      const row = r.rows[0];
      if (row === undefined) throw new ApplicationNotFoundError();
      return toRecord(row);
    });
  }

  /** `PUT /applications/:id/state`. Returns the new state; an unknown state is rejected and the old one kept. */
  async changeState(actor: OpportunityActor, applicationId: string, state: unknown): Promise<ApplicationRecord> {
    return this.mutate(actor, applicationId, 'state', (current) => setState(current, state));
  }

  /** `PUT /applications/:id/outcome`. An invalid value is rejected with the allowed values. */
  async changeOutcome(actor: OpportunityActor, applicationId: string, outcome: unknown): Promise<ApplicationRecord> {
    return this.mutate(actor, applicationId, 'outcome', (current) => {
      const result = setOutcome(current, outcome);
      return { ok: result.ok, application: result.application };
    });
  }

  private async mutate(
    actor: OpportunityActor,
    applicationId: string,
    field: 'state' | 'outcome',
    apply: (current: { state: ApplicationState; outcome: OutcomeValue | null }) => {
      ok: boolean;
      application: { state: ApplicationState; outcome?: OutcomeValue | null };
    },
  ): Promise<ApplicationRecord> {
    const { tenantId, userId } = actor.principal;
    return this.options.database.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const found = await tx.query<AppRow>(
        `SELECT ${COLUMNS} FROM opps.applications
          WHERE tenant_id = app.tenant() AND id = $1::uuid AND student_id = $2::uuid FOR UPDATE`,
        [applicationId, userId],
      );
      const row = found.rows[0];
      if (row === undefined) throw new ApplicationNotFoundError();
      const next = apply({ state: row.state, outcome: row.outcome });
      if (!next.ok) {
        throw new ApplicationValidationError(
          field,
          field === 'outcome' ? OUTCOME_VALUES : ['Saved', 'Preparing', 'Submitted'],
        );
      }
      const updated = await tx.query<AppRow>(
        `UPDATE opps.applications SET state = $3, outcome = $4, updated_at = now()
          WHERE tenant_id = app.tenant() AND id = $1::uuid AND student_id = $2::uuid
          RETURNING ${COLUMNS}`,
        [applicationId, userId, next.application.state, next.application.outcome ?? null],
      );
      const out = updated.rows[0];
      if (out === undefined) throw new ApplicationNotFoundError();
      return toRecord(out);
    });
  }

  /**
   * Sends reminders due now for one Tenant. `reminders_sent (application_id, kind)` is claimed before delivery so a
   * reminder is never sent twice; a failed delivery releases the claim for the next pass. Returns the count sent.
   */
  async sendDueReminders(tenantId: string, limit = 500): Promise<number> {
    const now = new Date(this.now());
    const candidates = await this.options.database.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{
        id: string;
        student_id: string;
        opportunity_id: string;
        state: ApplicationState;
        outcome: OutcomeValue | null;
        deadline: Date | string;
        sent: ReminderKind[] | null;
      }>(
        `SELECT a.id::text AS id, a.student_id::text AS student_id, a.opportunity_id::text AS opportunity_id,
                a.state, a.outcome, o.deadline,
                (SELECT array_agg(rs.kind) FROM opps.reminders_sent rs
                  WHERE rs.tenant_id = a.tenant_id AND rs.application_id = a.id) AS sent
           FROM opps.applications a
           JOIN opps.opportunities o ON o.tenant_id = a.tenant_id AND o.id = a.opportunity_id
          WHERE a.tenant_id = app.tenant() AND a.state IN ('Saved', 'Preparing') AND o.status = 'published'
            AND o.deadline > $1::timestamptz AND o.deadline <= $1::timestamptz + interval '7 days'
          ORDER BY o.deadline LIMIT $2`,
        [now.toISOString(), limit],
      );
      return r.rows;
    });

    let sentCount = 0;
    for (const c of candidates) {
      const kinds = dueReminders({ state: c.state, outcome: c.outcome }, new Date(c.deadline), now, c.sent ?? []);
      for (const kind of kinds) {
        const claimed = await this.options.database.transaction(async (tx) => {
          await useTenant(tx, tenantId);
          const r = await tx.query(
            `INSERT INTO opps.reminders_sent (tenant_id, application_id, kind)
             VALUES (app.tenant(), $1::uuid, $2) ON CONFLICT DO NOTHING`,
            [c.id, kind],
          );
          return (r.rowCount ?? 0) > 0;
        });
        if (!claimed) continue;
        try {
          await this.options.deliver({
            tenantId,
            studentId: c.student_id,
            applicationId: c.id,
            opportunityId: c.opportunity_id,
            kind,
          });
          sentCount += 1;
        } catch (error) {
          await this.options.database.transaction(async (tx) => {
            await useTenant(tx, tenantId);
            await tx.query(
              `DELETE FROM opps.reminders_sent WHERE tenant_id = app.tenant() AND application_id = $1::uuid AND kind = $2`,
              [c.id, kind],
            );
          });
          throw error;
        }
      }
    }
    return sentCount;
  }
}

export interface ReminderSweeperOptions {
  readonly service: ApplicationService;
  readonly tenantIds: () => Promise<readonly string[]>;
  readonly cadenceMs?: number;
  readonly onError?: (error: unknown) => void;
}

/** Runs `sendDueReminders` for every Tenant every 15 minutes (12.7). */
export class ReminderSweeper {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: ReminderSweeperOptions) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.runOnce(), this.options.cadenceMs ?? APPLICATION_REMINDER_CADENCE_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const tenantId of await this.options.tenantIds()) {
        try {
          await this.options.service.sendDueReminders(tenantId);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
  }
}
