// Canned reply management (task 18.6; requirement 7.6). Inserting a reply only fills the editor on the client;
// sending is a separate explicit submit, so this service never sends anything.

import { ErrorCode, normaliseText, textLength, type FieldError } from '@campusconnect/contracts';
import type { Instant } from '@campusconnect/domain/types';
import type { TicketActor, TicketDatabase } from '../tickets';
import {
  CANNED_BODY_MAX_LENGTH,
  CANNED_TITLE_MAX_LENGTH,
  WorkbenchError,
  type CannedReply,
  type CannedReplyInput,
} from './workbench.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COLUMNS = `id::text AS id, department_id::text AS department_id, title, body,
  (extract(epoch FROM created_at) * 1000)::bigint AS created_ms,
  (extract(epoch FROM updated_at) * 1000)::bigint AS updated_ms`;

interface CannedRow {
  id: string;
  department_id: string | null;
  title: string;
  body: string;
  created_ms: string | number;
  updated_ms: string | number;
}

const toReply = (r: CannedRow): CannedReply => ({
  id: r.id,
  departmentId: r.department_id,
  title: r.title,
  body: r.body,
  createdAt: Number(r.created_ms),
  updatedAt: Number(r.updated_ms),
});

export interface CannedReplyServiceOptions {
  readonly database: TicketDatabase;
  readonly now?: () => Instant;
}

export class CannedReplyService {
  private readonly now: () => Instant;

  constructor(private readonly o: CannedReplyServiceOptions) {
    this.now = o.now ?? ((): Instant => Date.now() as Instant);
  }

  /** Replies available to the actor: Tenant-wide ones and those of the actor's departments. */
  async list(actor: TicketActor): Promise<readonly CannedReply[]> {
    this.requireStaff(actor);
    return this.o.database.transaction(actor, async (tx) => {
      const rows = await tx.query<CannedRow>(
        `SELECT ${COLUMNS} FROM workbench.canned_replies WHERE tenant_id = $1::uuid ORDER BY title, id`,
        [actor.tenantId],
      );
      return rows.rows.map(toReply);
    });
  }

  async create(actor: TicketActor, input: CannedReplyInput): Promise<CannedReply> {
    this.requireStaff(actor);
    const v = this.validate(actor, input);
    return this.o.database.transaction(actor, async (tx) => {
      const rows = await tx.query<CannedRow>(
        `INSERT INTO workbench.canned_replies (tenant_id, department_id, title, body, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, to_timestamp($6::double precision / 1000.0),
                 to_timestamp($6::double precision / 1000.0))
         RETURNING ${COLUMNS}`,
        [actor.tenantId, v.departmentId, v.title, v.body, actor.userId, this.now()],
      );
      return toReply(rows.rows[0] as CannedRow);
    });
  }

  async update(actor: TicketActor, id: string, input: CannedReplyInput): Promise<CannedReply> {
    this.requireStaff(actor);
    if (!UUID.test(id)) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
    const v = this.validate(actor, input);
    return this.o.database.transaction(actor, async (tx) => {
      const rows = await tx.query<CannedRow>(
        `UPDATE workbench.canned_replies
         SET department_id = $3::uuid, title = $4, body = $5, updated_at = to_timestamp($6::double precision / 1000.0)
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         RETURNING ${COLUMNS}`,
        [actor.tenantId, id, v.departmentId, v.title, v.body, this.now()],
      );
      const row = rows.rows[0];
      if (row === undefined) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
      return toReply(row);
    });
  }

  async remove(actor: TicketActor, id: string): Promise<void> {
    this.requireStaff(actor);
    if (!UUID.test(id)) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
    await this.o.database.transaction(actor, async (tx) => {
      const rows = await tx.query(
        `DELETE FROM workbench.canned_replies WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id`,
        [actor.tenantId, id],
      );
      if (rows.rows.length === 0) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
    });
  }

  private requireStaff(actor: TicketActor): void {
    if (!actor.roles.includes('handler') && !actor.roles.includes('dept_head')) {
      throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    }
  }

  private validate(
    actor: TicketActor,
    input: CannedReplyInput,
  ): { title: string; body: string; departmentId: string | null } {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new WorkbenchError(ErrorCode.VALIDATION_FAILED, [{ path: '', rule: 'type', expected: 'object' }]);
    }
    const fields: FieldError[] = Object.keys(input)
      .filter((k) => !['title', 'body', 'departmentId'].includes(k))
      .map((k): FieldError => ({ path: k, rule: 'unknown_field' }));
    const title = typeof input.title === 'string' ? normaliseText(input.title, { trim: true }) : '';
    if (typeof input.title !== 'string' || textLength(title) < 1 || textLength(title) > CANNED_TITLE_MAX_LENGTH) {
      fields.push({ path: 'title', rule: 'length', min: 1, max: CANNED_TITLE_MAX_LENGTH });
    }
    const body = typeof input.body === 'string' ? normaliseText(input.body, { trim: true }) : '';
    if (typeof input.body !== 'string' || textLength(body) < 1 || textLength(body) > CANNED_BODY_MAX_LENGTH) {
      fields.push({ path: 'body', rule: 'length', min: 1, max: CANNED_BODY_MAX_LENGTH });
    }
    const departmentId = input.departmentId ?? null;
    if (departmentId !== null && (typeof departmentId !== 'string' || !UUID.test(departmentId))) {
      fields.push({ path: 'departmentId', rule: 'uuid' });
    }
    if (fields.length > 0) throw new WorkbenchError(ErrorCode.VALIDATION_FAILED, fields);

    // Tenant-wide replies are managed by Dept_Heads; a department reply needs membership in that department.
    if (departmentId === null && !actor.roles.includes('dept_head')) {
      throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    }
    if (departmentId !== null && !(actor.departmentIds ?? []).includes(departmentId)) {
      throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    }
    return { title, body, departmentId };
  }
}
