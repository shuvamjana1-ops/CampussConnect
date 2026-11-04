// Data subject requests (19.3, 19.4, 19.9, 19.10): export and erasure with a 30-day due date.
// Providers run in one transaction, so a failure leaves every module's data unchanged.

import {
  useTenant,
  type OutboxDatabase,
  type OutboxSqlClient,
} from "../outbox/outbox.types";
import {
  DsrNotFoundError,
  DsrStateError,
  type DsrKind,
  type DsrStatus,
  type PrivacyNotifier,
  type RetainedCategory,
  type SubjectDataProvider,
} from "./privacy.types";

export interface DsrRequest {
  readonly id: string;
  readonly kind: DsrKind;
  readonly status: DsrStatus;
  readonly requestedAt: string;
  readonly dueAt: string;
  readonly completedAt: string | null;
  readonly failureReason: string | null;
}

interface DsrRow {
  id: string;
  user_id: string;
  kind: DsrKind;
  status: DsrStatus;
  requested_at: Date | string;
  due_at: Date | string;
  completed_at: Date | string | null;
  failure_reason: string | null;
}

const COLUMNS =
  "id::text, user_id::text, kind, status, requested_at, due_at, completed_at, failure_reason";
const iso = (v: Date | string): string => new Date(v).toISOString();

function toRequest(r: DsrRow): DsrRequest {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    requestedAt: iso(r.requested_at),
    dueAt: iso(r.due_at),
    completedAt: r.completed_at === null ? null : iso(r.completed_at),
    failureReason: r.failure_reason,
  };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.slice(0, 500);
}

export class DsrService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly providers: readonly SubjectDataProvider[],
    private readonly notifier: PrivacyNotifier,
    private readonly now: () => number = Date.now,
  ) {}

  /** Opens a request due 30 days from now. An unfinished request of the same kind is returned instead of a duplicate. */
  async submit(
    tenantId: string,
    userId: string,
    kind: DsrKind,
  ): Promise<DsrRequest> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const inserted = await tx.query<DsrRow>(
        `INSERT INTO privacy.dsr_requests (tenant_id, user_id, kind)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (tenant_id, user_id, kind) WHERE status <> 'completed' DO NOTHING
         RETURNING ${COLUMNS}`,
        [tenantId, userId, kind],
      );
      if (inserted.rows[0]) return toRequest(inserted.rows[0]);
      const existing = await tx.query<DsrRow>(
        `SELECT ${COLUMNS} FROM privacy.dsr_requests
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND kind = $3 AND status <> 'completed'`,
        [tenantId, userId, kind],
      );
      const row = existing.rows[0];
      if (!row) throw new DsrStateError("Request could not be opened.");
      return toRequest(row);
    });
  }

  /** Re-opens a failed request so it is processed again; data stayed unchanged since the failure (19.10). */
  async resubmit(
    tenantId: string,
    userId: string,
    requestId: string,
  ): Promise<DsrRequest> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const found = await tx.query<DsrRow>(
        `SELECT ${COLUMNS} FROM privacy.dsr_requests
         WHERE tenant_id = $1::uuid AND id = $2::uuid AND user_id = $3::uuid FOR UPDATE`,
        [tenantId, requestId, userId],
      );
      const row = found.rows[0];
      if (!row) throw new DsrNotFoundError();
      if (row.status !== "failed")
        throw new DsrStateError("Only a failed request can be resubmitted.");
      const updated = await tx.query<DsrRow>(
        `UPDATE privacy.dsr_requests SET status = 'open', failure_reason = NULL
         WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING ${COLUMNS}`,
        [tenantId, requestId],
      );
      return toRequest(updated.rows[0] ?? row);
    });
  }

  async list(tenantId: string, userId: string): Promise<readonly DsrRequest[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<DsrRow>(
        `SELECT ${COLUMNS} FROM privacy.dsr_requests
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid ORDER BY requested_at DESC`,
        [tenantId, userId],
      );
      return rows.rows.map(toRequest);
    });
  }

  /** The completed export, for the Student who asked for it. */
  async getExport(
    tenantId: string,
    userId: string,
    requestId: string,
  ): Promise<unknown> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<{ export_payload: unknown }>(
        `SELECT export_payload FROM privacy.dsr_requests
         WHERE tenant_id = $1::uuid AND id = $2::uuid AND user_id = $3::uuid
           AND kind = 'export' AND status = 'completed'`,
        [tenantId, requestId, userId],
      );
      const row = rows.rows[0];
      if (!row) throw new DsrNotFoundError();
      return row.export_payload;
    });
  }

  /** Processes every open request in a Tenant. Called by the DSR staff. */
  async processOpen(
    tenantId: string,
  ): Promise<{ completed: number; failed: number }> {
    const open = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<{ id: string }>(
        `SELECT id::text FROM privacy.dsr_requests
         WHERE tenant_id = $1::uuid AND status = 'open' ORDER BY requested_at`,
        [tenantId],
      );
      return rows.rows.map((r) => r.id);
    });
    let completed = 0;
    let failed = 0;
    for (const id of open) {
      if (await this.process(tenantId, id)) completed += 1;
      else failed += 1;
    }
    return { completed, failed };
  }

  /** Runs one request. Returns true when it completed; on failure the data is unchanged and the Student is told why. */
  async process(tenantId: string, requestId: string): Promise<boolean> {
    let kind: DsrKind = "export";
    let userId = "";
    try {
      await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        const found = await tx.query<DsrRow>(
          `SELECT ${COLUMNS} FROM privacy.dsr_requests
           WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
          [tenantId, requestId],
        );
        const row = found.rows[0];
        if (!row) throw new DsrNotFoundError();
        kind = row.kind;
        userId = row.user_id;
        if (row.status !== "open")
          throw new DsrStateError("Request is not open.");
        await tx.query(
          `UPDATE privacy.dsr_requests SET attempts = attempts + 1 WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [tenantId, requestId],
        );
        if (kind === "export")
          await this.runExport(tx, tenantId, userId, requestId);
        else await this.runErasure(tx, tenantId, userId, requestId);
      });
      return true;
    } catch (error) {
      if (userId === "") throw error;
      await this.recordFailure(
        tenantId,
        requestId,
        userId,
        kind,
        reasonOf(error),
      );
      return false;
    }
  }

  /** Tells the Student about requests that passed their due date. They stay open and their data is unchanged (19.9). */
  async notifyOverdue(tenantId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<{
        id: string;
        user_id: string;
        kind: DsrKind;
        failure_reason: string | null;
      }>(
        `UPDATE privacy.dsr_requests SET late_notified_at = to_timestamp($2 / 1000.0)
         WHERE tenant_id = $1::uuid AND status <> 'completed' AND late_notified_at IS NULL
           AND due_at <= to_timestamp($2 / 1000.0)
         RETURNING id::text, user_id::text, kind, failure_reason`,
        [tenantId, this.now()],
      );
      for (const r of rows.rows) {
        await this.notifier.notify(tx, tenantId, r.user_id, {
          type: "dsr_failed",
          requestId: r.id,
          kind: r.kind,
          reason:
            r.failure_reason ?? "The request was not completed within 30 days.",
        });
      }
      return rows.rows.length;
    });
  }

  private async runExport(
    tx: OutboxSqlClient,
    tenantId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    for (const provider of this.providers) {
      data[provider.category] = await provider.exportSubjectData(
        tx,
        tenantId,
        userId,
      );
    }
    await tx.query(
      `UPDATE privacy.dsr_requests
       SET status = 'completed', completed_at = now(), failure_reason = NULL, export_payload = $3::jsonb
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [
        tenantId,
        requestId,
        JSON.stringify({
          subject: userId,
          exportedAt: new Date(this.now()).toISOString(),
          data,
        }),
      ],
    );
    await this.notifier.notify(tx, tenantId, userId, {
      type: "dsr_export_ready",
      requestId,
    });
  }

  private async runErasure(
    tx: OutboxSqlClient,
    tenantId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const retained: RetainedCategory[] = [];
    for (const provider of this.providers) {
      retained.push(...(await provider.eraseSubject(tx, tenantId, userId)));
    }
    await tx.query(
      `UPDATE privacy.dsr_requests
       SET status = 'completed', completed_at = now(), failure_reason = NULL, retained_categories = $3::jsonb
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, requestId, JSON.stringify(retained)],
    );
    await this.notifier.notify(tx, tenantId, userId, {
      type: "dsr_erasure_completed",
      requestId,
      retained,
    });
  }

  private async recordFailure(
    tenantId: string,
    requestId: string,
    userId: string,
    kind: DsrKind,
    reason: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `UPDATE privacy.dsr_requests SET status = 'failed', failure_reason = $3
         WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [tenantId, requestId, reason],
      );
      await this.notifier.notify(tx, tenantId, userId, {
        type: "dsr_failed",
        requestId,
        kind,
        reason,
      });
    });
  }
}
