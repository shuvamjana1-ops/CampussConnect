// Bulk reassignment (task 18.7; requirements 7.8, 7.9). Every selected Ticket is locked in id order and validated
// before any change; one failure rejects the whole request. SLA clocks are not touched, so due times stay unchanged.

import { ErrorCode, normaliseText, textLength, type BulkReassignFailure, type FieldError } from '@campusconnect/contracts';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import type { Instant } from '@campusconnect/domain/types';
import { AuditService } from '../audit';
import { auditCode, auditRef, type AuditDetailValue } from '../audit/audit.types';
import type { TicketActor, TicketDatabase } from '../tickets';
import {
  BULK_REASSIGN_MAX,
  BULK_REASSIGN_MIN,
  BulkReassignFailedError,
  WorkbenchError,
  type BulkReassignInput,
  type BulkReassignResult,
} from './workbench.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REASON_MAX_LENGTH = 500;

export interface BulkReassignServiceOptions {
  readonly database: TicketDatabase;
  readonly audit: AuditService;
  readonly redactor: PiiRedactor;
  readonly now?: () => Instant;
}

interface LockedRow {
  id: string;
  is_open: boolean;
  status: string;
  department_id: string | null;
  assignee_id: string | null;
}

const hasRole = (actor: TicketActor, ...roles: readonly string[]): boolean => roles.some((r) => actor.roles.includes(r));
const roleCode = (actor: TicketActor): ReturnType<typeof auditCode> =>
  auditCode(actor.roles.find((r) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u.test(r)) ?? 'unknown');

function invalid(fields: FieldError[]): never {
  throw new WorkbenchError(ErrorCode.VALIDATION_FAILED, fields);
}

export class BulkReassignService {
  private readonly now: () => Instant;

  constructor(private readonly o: BulkReassignServiceOptions) {
    this.now = o.now ?? ((): Instant => Date.now() as Instant);
  }

  /** `POST /tickets/bulk-reassign`. */
  async reassign(actor: TicketActor, input: BulkReassignInput): Promise<BulkReassignResult> {
    if (!hasRole(actor, 'handler', 'dept_head')) throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    const request = this.validate(input);
    const now = this.now();

    // Redaction runs before any row lock is taken. A redaction failure never blocks the reassignment: the audit
    // entry then carries a fixed code in place of the reason text, and the full reason stays in the Ticket history.
    let auditReason: AuditDetailValue;
    try {
      auditReason = (await this.o.redactor.redact(request.reason, { tenantId: actor.tenantId })).text as AuditDetailValue;
    } catch {
      auditReason = auditCode('reason_redaction_failed');
    }

    return this.o.database.transaction(actor, async (tx) => {
      // Lock in id order so concurrent bulk requests cannot deadlock (7.8).
      const ids = [...request.ticketIds].sort();
      const locked = await tx.query<LockedRow>(
        `SELECT t.id::text AS id, t.is_open, t.status, t.department_id::text AS department_id,
                t.assignee_id::text AS assignee_id
         FROM tickets.tickets t
         WHERE t.tenant_id = $1::uuid AND t.id = ANY($2::uuid[])
         ORDER BY t.id
         FOR UPDATE OF t`,
        [actor.tenantId, ids],
      );
      const byId = new Map(locked.rows.map((r) => [r.id.toLowerCase(), r]));

      // Eligible targets: Handlers and Dept_Heads of each Ticket's department (checked per department).
      const target = await tx.query<{ department_id: string }>(
        `SELECT d.department_id::text AS department_id
         FROM core.user_roles r
         JOIN core.user_departments d ON d.tenant_id = r.tenant_id AND d.user_id = r.user_id
         WHERE r.tenant_id = $1::uuid AND r.user_id = $2::uuid AND r.role IN ('handler', 'dept_head')`,
        [actor.tenantId, request.assigneeId],
      );
      const targetDepartments = new Set(target.rows.map((r) => r.department_id));
      const scope = new Set(actor.departmentIds ?? []);

      const failures: BulkReassignFailure[] = [];
      for (const id of ids) {
        const row = byId.get(id.toLowerCase());
        if (row === undefined || row.department_id === null || !scope.has(row.department_id)) {
          failures.push({ ticketId: id, code: ErrorCode.ACCESS_DENIED });
        } else if (!row.is_open || row.status === 'Closed') {
          failures.push({ ticketId: id, code: ErrorCode.TICKET_CLOSED });
        } else if (!targetDepartments.has(row.department_id)) {
          failures.push({ ticketId: id, code: ErrorCode.VALIDATION_FAILED });
        }
      }
      // All-or-nothing: nothing has been written yet, so rejecting leaves every Ticket unchanged (7.9).
      if (failures.length > 0) throw new BulkReassignFailedError(failures);

      const reassigned: { ticketId: string; fromAssigneeId: string | null }[] = [];
      for (const id of ids) {
        const row = byId.get(id.toLowerCase()) as LockedRow;
        // Unchanged due times: only the Ticket row is touched, never `sla.sla_clocks`.
        await tx.query(
          `UPDATE tickets.tickets
           SET assignee_id = $3::uuid, version = version + 1, updated_at = to_timestamp($4::double precision / 1000.0)
           WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [actor.tenantId, row.id, request.assigneeId, now],
        );
        await tx.query(
          `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason, kind)
           VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), $5, $5, $6, 'status')`,
          [actor.tenantId, row.id, actor.userId, now, row.status, request.reason],
        );
        await this.o.audit.record(tx, actor.tenantId, {
          actor: actor.userId,
          role: roleCode(actor),
          action: auditCode('ticket.reassigned'),
          target: `ticket:${row.id}`,
          outcome: 'success',
          details: {
            ...(row.assignee_id === null ? {} : { fromAssignee: auditRef(row.assignee_id) }),
            toAssignee: auditRef(request.assigneeId),
            reason: auditReason,
          },
          timestampMs: now,
        });
        reassigned.push({ ticketId: row.id, fromAssigneeId: row.assignee_id });
      }
      return { assigneeId: request.assigneeId, reassigned };
    });
  }

  private validate(input: BulkReassignInput): { ticketIds: string[]; assigneeId: string; reason: string } {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      invalid([{ path: '', rule: 'type', expected: 'object' }]);
    }
    const extra = Object.keys(input).filter((k) => !['ticketIds', 'assigneeId', 'reason'].includes(k));
    if (extra.length > 0) invalid(extra.map((k): FieldError => ({ path: k, rule: 'unknown_field' })));

    const fields: FieldError[] = [];
    const ids: unknown = input.ticketIds;
    if (!Array.isArray(ids) || ids.length < BULK_REASSIGN_MIN || ids.length > BULK_REASSIGN_MAX) {
      fields.push({ path: 'ticketIds', rule: 'count', min: BULK_REASSIGN_MIN, max: BULK_REASSIGN_MAX });
    } else {
      ids.forEach((id, i) => {
        if (typeof id !== 'string' || !UUID.test(id)) fields.push({ path: `ticketIds.${i}`, rule: 'uuid' });
      });
      if (fields.length === 0 && new Set(ids.map((i) => String(i).toLowerCase())).size !== ids.length) {
        fields.push({ path: 'ticketIds', rule: 'distinct' });
      }
    }
    if (typeof input.assigneeId !== 'string' || !UUID.test(input.assigneeId)) {
      fields.push({ path: 'assigneeId', rule: 'uuid' });
    }
    const text = typeof input.reason === 'string' ? normaliseText(input.reason, { trim: true }) : '';
    if (typeof input.reason !== 'string' || textLength(text) < 1 || textLength(text) > REASON_MAX_LENGTH) {
      fields.push({ path: 'reason', rule: 'length', min: 1, max: REASON_MAX_LENGTH });
    }
    if (fields.length > 0) invalid(fields);
    return { ticketIds: [...(ids as string[])], assigneeId: input.assigneeId, reason: text };
  }
}
