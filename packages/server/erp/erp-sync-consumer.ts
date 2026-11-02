// The `erp-sync` queue consumer: pages `listStudentsChangedSince`, updates Student rows, applies inactive enrolment
// in the same transaction and emits `ErpStudentChanged` (17.5, 17.6, 17.9). Failed cycles retry under ERP_SYNC_POLICY.

import type { ErpAdapter, ErpStudent } from '@campusconnect/erp-adapter';
import { ERP_SYNC_POLICY } from '@campusconnect/domain/retry';
import {
  QueueConsumer,
  enqueueEvent,
  type DecodedMessage,
  type MessageResult,
  type OutboxDatabase,
  type OutboxSqlClient,
  type QueueClient,
  type QueueConsumerOptions,
} from '../outbox';
import { ERP_SYNC_PAGE_SIZE, ERP_SYNC_QUEUE } from './erp.types';

export interface ErpSyncMessage {
  readonly tenantId: string;
  /** Unique per scheduled cycle; retries of one cycle redeliver the same message. */
  readonly cycleId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSyncMessage(body: string): ErpSyncMessage | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { tenantId, cycleId } = raw as Record<string, unknown>;
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) return undefined;
  if (typeof cycleId !== 'string' || cycleId.length < 1 || cycleId.length > 128) return undefined;
  return { tenantId, cycleId };
}

interface StudentRow {
  user_id: string;
  roll_number: string;
  program: string;
  year: number;
  erp_department: string;
  hostel: string | null;
  gender: string | null;
  social_category: string | null;
  enrolment_status: 'active' | 'inactive';
}

export interface ErpSyncConsumerOptions extends QueueConsumerOptions {
  readonly pageSize?: number;
}

export class ErpSyncConsumer extends QueueConsumer<ErpSyncMessage> {
  readonly consumer = 'erp-sync';
  readonly queue = ERP_SYNC_QUEUE;
  private readonly pageSize: number;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly erp: ErpAdapter,
    options: ErpSyncConsumerOptions = {},
  ) {
    super(db, client, { ...options, policy: options.policy ?? ERP_SYNC_POLICY });
    this.pageSize = options.pageSize ?? ERP_SYNC_PAGE_SIZE;
  }

  protected decode(body: string): DecodedMessage<ErpSyncMessage> {
    const value = parseSyncMessage(body);
    if (value === undefined) throw new Error('Malformed erp-sync message.');
    return { tenantId: value.tenantId, eventId: value.cycleId, value };
  }

  /**
   * A failed attempt rolls back its transaction, so the failure is recorded in a separate one. Once the retries are
   * used up the Tenant's data is flagged stale; the last successfully synchronised data stays in use (17.6).
   */
  override async process(body: string): Promise<MessageResult> {
    try {
      return await super.process(body);
    } catch (error) {
      const message = parseSyncMessage(body);
      if (message !== undefined) await this.recordFailure(message.tenantId, error);
      throw error;
    }
  }

  protected async apply(tx: OutboxSqlClient, { tenantId }: ErpSyncMessage): Promise<void> {
    const state = await tx.query<{ cursor: string | null }>(
      `SELECT cursor FROM core.erp_sync_state WHERE tenant_id = $1::uuid FOR UPDATE`,
      [tenantId],
    );
    let cursor = state.rows[0]?.cursor ?? null;
    let changed = 0;
    let more = true;
    while (more) {
      const page = await this.erp.listStudentsChangedSince(tenantId, cursor, { size: this.pageSize });
      for (const student of page.items) {
        if (await this.applyStudent(tx, tenantId, student)) changed += 1;
      }
      cursor = page.next ?? cursor;
      more = page.next !== null;
    }

    await tx.query(
      `INSERT INTO core.erp_sync_state
         (tenant_id, cursor, last_attempt_at, last_success_at, stale, consecutive_failures, last_error, updated_at)
       VALUES ($1::uuid, $2, now(), now(), false, 0, NULL, now())
       ON CONFLICT (tenant_id) DO UPDATE
         SET cursor = EXCLUDED.cursor, last_attempt_at = now(), last_success_at = now(), stale = false,
             consecutive_failures = 0, last_error = NULL, updated_at = now()`,
      [tenantId, cursor],
    );
    await tx.query(
      `INSERT INTO core.erp_sync_attempts (tenant_id, succeeded, students_changed) VALUES ($1::uuid, true, $2)`,
      [tenantId, changed],
    );
  }

  /** Updates one Student row, including inactive enrolment. Unknown Students are provisioned at first sign-in. */
  private async applyStudent(tx: OutboxSqlClient, tenantId: string, erp: ErpStudent): Promise<boolean> {
    const existing = await tx.query<StudentRow>(
      `SELECT user_id::text AS user_id, roll_number, program, year, erp_department, hostel, gender, social_category,
              enrolment_status
       FROM core.students WHERE tenant_id = $1::uuid AND erp_external_id = $2 FOR UPDATE`,
      [tenantId, erp.externalId],
    );
    const row = existing.rows[0];
    if (row === undefined) return false;

    const changedFields = diffFields(row, erp);
    await tx.query(
      `UPDATE core.students
       SET roll_number = $3, program = $4, year = $5, erp_department = $6, hostel = $7, gender = $8,
           social_category = $9, enrolment_status = $10, erp_synced_at = now()
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [
        tenantId,
        row.user_id,
        erp.rollNumber,
        erp.program,
        erp.year,
        erp.department,
        erp.hostel ?? null,
        erp.gender ?? null,
        erp.socialCategory ?? null,
        erp.enrolmentStatus,
      ],
    );
    if (changedFields.length === 0) return false;
    await enqueueEvent(tx, {
      type: 'ErpStudentChanged',
      version: 1,
      tenantId,
      payload: {
        studentId: row.user_id,
        externalId: erp.externalId,
        enrolmentStatus: erp.enrolmentStatus,
        changedFields,
      },
    });
    return true;
  }

  private async recordFailure(tenantId: string, error: unknown): Promise<void> {
    const text = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
        const state = await tx.query<{ consecutive_failures: number }>(
          `INSERT INTO core.erp_sync_state
             (tenant_id, last_attempt_at, consecutive_failures, last_error, stale, updated_at)
           VALUES ($1::uuid, now(), 1, $2, false, now())
           ON CONFLICT (tenant_id) DO UPDATE
             SET last_attempt_at = now(), consecutive_failures = core.erp_sync_state.consecutive_failures + 1,
                 last_error = EXCLUDED.last_error, updated_at = now()
           RETURNING consecutive_failures`,
          [tenantId, text],
        );
        const failures = state.rows[0]?.consecutive_failures ?? 1;
        // First attempt plus `maxRetries` retries: the data is stale once they are all used.
        if (failures > ERP_SYNC_POLICY.maxRetries) {
          await tx.query(`UPDATE core.erp_sync_state SET stale = true WHERE tenant_id = $1::uuid`, [tenantId]);
        }
        await tx.query(
          `INSERT INTO core.erp_sync_attempts (tenant_id, succeeded, error) VALUES ($1::uuid, false, $2)`,
          [tenantId, text],
        );
      });
    } catch (recordError) {
      this.options.onError?.(recordError, { body: '', receiptHandle: '', receiveCount: 0 });
    }
  }
}

function diffFields(row: StudentRow, erp: ErpStudent): string[] {
  const pairs: [string, unknown, unknown][] = [
    ['rollNumber', row.roll_number, erp.rollNumber],
    ['program', row.program, erp.program],
    ['year', row.year, erp.year],
    ['department', row.erp_department, erp.department],
    ['hostel', row.hostel, erp.hostel ?? null],
    ['gender', row.gender, erp.gender ?? null],
    ['socialCategory', row.social_category, erp.socialCategory ?? null],
    ['enrolmentStatus', row.enrolment_status, erp.enrolmentStatus],
  ];
  return pairs.filter(([, before, after]) => before !== after).map(([name]) => name);
}
