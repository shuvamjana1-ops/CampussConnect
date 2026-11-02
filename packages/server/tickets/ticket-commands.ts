// Ticket commands, messages and Student views (task 15.7). Every command runs in one transaction that locks the
// Ticket row, applies the domain state machine, writes the update, history, outbox events, timers and the audit
// entry, so an audit failure rolls the whole change back (audit-or-nothing, 18.9).

import { ErrorCode, normaliseText, textLength, type FieldError } from '@campusconnect/contracts';
import type { Role } from '@campusconnect/domain/rbac';
import {
  CONFIRMATION_WINDOW_MS,
  applyCommand,
  projectTicketForViewer,
  type Actor,
  type HandlerCandidate,
  type OwnerLevel,
  type RevealRecord,
  type Ticket,
  type TicketCommand,
  type TicketStatus,
} from '@campusconnect/domain/tickets';
import type { DepartmentId, Instant, TicketId, UserId } from '@campusconnect/domain/types';
import { AuditService } from '../audit';
import { auditCode, auditRef } from '../audit/audit.types';
import { cancelTimer, enqueueEvent, upsertTimer } from '../outbox';
import { PRIORITY_BANDS, type PriorityBand } from '../tenancy';
import {
  BAND_REASON_MAX_LENGTH,
  COMMAND_TYPES,
  INTERNAL_NOTE_MAX_LENGTH,
  MAX_ETA_AHEAD_MS,
  PUBLIC_MESSAGE_MAX_LENGTH,
  TicketCommandError,
  type ListOptions,
  type PostMessageInput,
  type PostMessageResult,
  type TicketCommandInput,
  type TicketCommandResult,
  type TicketHistoryItem,
  type TicketListItem,
} from './ticket-commands.types';
import type { TicketActor, TicketDatabase, TicketSqlClient } from './tickets.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const AWAITING_STUDENT_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const STAFF_ROLES = ['handler', 'dept_head'] as const;

export interface TicketCommandServiceOptions {
  readonly database: TicketDatabase;
  readonly audit: AuditService;
  readonly now?: () => Instant;
}

interface TicketRow {
  id: string;
  ref: string;
  type: string;
  title: string;
  confidential: boolean;
  anon_ref: string | null;
  status: TicketStatus;
  band: PriorityBand;
  department_id: string | null;
  assignee_id: string | null;
  owner_level: OwnerLevel;
  escalation_level: number;
  reporter_id: string;
  resolver_id: string | null;
  resolved_ms: string | number | null;
  closure_reason: Ticket['closureReason'];
  auto_confirmed: boolean;
  rating: number | null;
  sla_budget_factor: string | number;
  eta_ms: string | number | null;
  first_response_ms: string | number | null;
  version: number;
}

const ROW_SELECT = `t.id::text AS id, t.ref, t.type, t.title, t.confidential, t.anon_ref, t.status, t.band,
  t.department_id::text AS department_id, t.assignee_id::text AS assignee_id, t.owner_level, t.escalation_level,
  t.reporter_id::text AS reporter_id, t.resolver_id::text AS resolver_id,
  (extract(epoch FROM t.resolved_at) * 1000)::bigint AS resolved_ms, t.closure_reason, t.auto_confirmed, t.rating,
  t.sla_budget_factor, (extract(epoch FROM t.eta) * 1000)::bigint AS eta_ms,
  (extract(epoch FROM t.first_response_at) * 1000)::bigint AS first_response_ms, t.version`;

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

function toDomainTicket(row: TicketRow): Ticket {
  return {
    id: row.id as TicketId,
    reporterId: row.reporter_id as UserId,
    departmentId: (row.department_id ?? '') as DepartmentId,
    status: row.status,
    assigneeId: row.assignee_id as UserId | null,
    ownerLevel: row.owner_level,
    resolverId: row.resolver_id as UserId | null,
    resolvedAt: num(row.resolved_ms) as Instant | null,
    closureReason: row.closure_reason,
    autoConfirmed: row.auto_confirmed,
    rating: row.rating,
    slaBudgetFactor: Number(row.sla_budget_factor),
  };
}

const hasRole = (actor: TicketActor, ...roles: readonly string[]): boolean => roles.some((r) => actor.roles.includes(r));
const isStaff = (actor: TicketActor): boolean => hasRole(actor, ...STAFF_ROLES);
const isStudentOnly = (actor: TicketActor): boolean => actor.roles.length > 0 && actor.roles.every((r) => r === 'student');
const roleCode = (actor: TicketActor): ReturnType<typeof auditCode> =>
  auditCode(actor.roles.find((r) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u.test(r)) ?? 'unknown');

function invalid(fields: FieldError[]): never {
  throw new TicketCommandError(ErrorCode.VALIDATION_FAILED, fields);
}

function validReason(value: unknown): string {
  const text = typeof value === 'string' ? normaliseText(value, { trim: true }) : '';
  if (typeof value !== 'string' || textLength(text) < 1 || textLength(text) > BAND_REASON_MAX_LENGTH) {
    invalid([{ path: 'reason', rule: 'length', min: 1, max: BAND_REASON_MAX_LENGTH }]);
  }
  return text;
}

export class TicketCommandService {
  private readonly database: TicketDatabase;
  private readonly audit: AuditService;
  private readonly now: () => Instant;

  constructor(options: TicketCommandServiceOptions) {
    this.database = options.database;
    this.audit = options.audit;
    this.now = options.now ?? ((): Instant => Date.now() as Instant);
  }

  /** `POST /tickets/{id}/commands`. `ifMatch` is the Ticket version the client loaded. */
  async execute(
    actor: TicketActor,
    ticketId: string,
    ifMatch: number | undefined,
    input: TicketCommandInput,
  ): Promise<TicketCommandResult> {
    if (!UUID.test(ticketId)) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
    if (ifMatch === undefined || !Number.isInteger(ifMatch) || ifMatch < 1) {
      invalid([{ path: 'If-Match', rule: 'required' }]);
    }
    if (!(COMMAND_TYPES as readonly string[]).includes(input.type)) {
      invalid([{ path: 'type', rule: 'enum', allowed: COMMAND_TYPES }]);
    }
    const now = this.now();

    return this.database.transaction(actor, async (tx) => {
      const row = await this.lock(tx, ticketId);
      if (row === undefined) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
      if (row.version !== ifMatch) throw new TicketCommandError(ErrorCode.VERSION_CONFLICT);
      await this.requireActiveEnrolment(tx, actor);

      const staffCommand = !['student_respond', 'confirm', 'dispute', 'withdraw'].includes(input.type);
      // At L1 with no ETA, a Handler may do nothing but set one (6.4, G7).
      if (staffCommand && input.type !== 'set_eta' && isStaff(actor) && row.escalation_level >= 1 && row.eta_ms === null) {
        throw new TicketCommandError(ErrorCode.ETA_REQUIRED);
      }

      if (input.type === 'change_band') return this.changeBand(tx, actor, row, input, now);
      if (input.type === 'set_eta') return this.setEta(tx, actor, row, input, now);
      return this.applyDomain(tx, actor, row, input, now);
    });
  }

  /** `POST /tickets/{id}/messages`. Public replies and internal notes. */
  async postMessage(actor: TicketActor, ticketId: string, input: PostMessageInput): Promise<PostMessageResult> {
    if (!UUID.test(ticketId)) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
    if (input.visibility !== 'public' && input.visibility !== 'internal') {
      invalid([{ path: 'visibility', rule: 'enum', allowed: ['public', 'internal'] }]);
    }
    const max = input.visibility === 'internal' ? INTERNAL_NOTE_MAX_LENGTH : PUBLIC_MESSAGE_MAX_LENGTH;
    const body = typeof input.body === 'string' ? normaliseText(input.body, { trim: true }) : '';
    if (typeof input.body !== 'string' || textLength(body) < 1 || textLength(body) > max) {
      invalid([{ path: 'body', rule: 'length', min: 1, max }]);
    }
    const staff = isStaff(actor) || hasRole(actor, 'ombudsperson');
    if (input.visibility === 'internal' && !staff) throw new TicketCommandError(ErrorCode.INSUFFICIENT_PERMISSION);
    if (!staff && !hasRole(actor, 'student')) throw new TicketCommandError(ErrorCode.INSUFFICIENT_PERMISSION);
    const nowMs = this.now();

    return this.database.transaction(actor, async (tx) => {
      const row = await this.lock(tx, ticketId);
      if (row === undefined) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
      if (!staff && row.reporter_id !== actor.userId) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
      if (row.status === 'Closed') throw new TicketCommandError(ErrorCode.TICKET_CLOSED);
      await this.requireActiveEnrolment(tx, actor);

      // The first public reply by a Handler is the first response for SLA purposes (3.14).
      const firstResponse =
        input.visibility === 'public' && hasRole(actor, 'handler', 'dept_head') && row.first_response_ms === null;
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO tickets.ticket_messages (tenant_id, ticket_id, author_id, visibility, body, is_first_public_response, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, to_timestamp($7::double precision / 1000.0))
         RETURNING id::text AS id`,
        [actor.tenantId, ticketId, actor.userId, input.visibility, body, firstResponse, nowMs],
      );
      const messageId = inserted.rows[0]?.id;
      if (messageId === undefined) throw new Error('Message insert returned no row.');
      if (firstResponse) {
        await tx.query(
          `UPDATE tickets.tickets SET first_response_at = to_timestamp($3::double precision / 1000.0),
                  updated_at = to_timestamp($3::double precision / 1000.0)
            WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [actor.tenantId, ticketId, nowMs],
        );
      }
      await this.audit.record(tx, actor.tenantId, {
        actor: actor.userId,
        role: roleCode(actor),
        action: auditCode(input.visibility === 'internal' ? 'ticket.note_added' : 'ticket.reply_posted'),
        target: `ticket:${ticketId}`,
        outcome: 'success',
        details: { messageId: auditRef(messageId), firstResponse: auditCode(firstResponse ? 'true' : 'false') },
        timestampMs: nowMs,
      });
      return { messageId, visibility: input.visibility, firstPublicResponse: firstResponse, createdAt: nowMs };
    });
  }

  /** `GET /tickets?scope=mine`: the Student's own Tickets, newest first. */
  async listMine(actor: TicketActor, options: ListOptions = {}): Promise<readonly TicketListItem[]> {
    const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);
    const offset = Math.max(0, options.offset ?? 0);
    return this.database.transaction(actor, async (tx) => {
      const result = await tx.query<ListRow>(
        `SELECT ${ROW_SELECT}, d.name AS department_name,
                (extract(epoch FROM t.first_response_due_at) * 1000)::bigint AS first_due_ms,
                (extract(epoch FROM t.resolution_due_at) * 1000)::bigint AS resolution_due_ms,
                (extract(epoch FROM t.created_at) * 1000)::bigint AS created_ms,
                (extract(epoch FROM t.updated_at) * 1000)::bigint AS updated_ms
           FROM tickets.tickets t
           LEFT JOIN core.departments d ON d.tenant_id = t.tenant_id AND d.id = t.department_id
          WHERE t.tenant_id = $1::uuid AND t.reporter_id = $2::uuid
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT $3 OFFSET $4`,
        [actor.tenantId, actor.userId, limit, offset],
      );
      return result.rows.map(toListItem);
    });
  }

  /** `GET /tickets/{id}`: status, department, SLA due times, history and messages, projected for the viewer. */
  async getTicket(actor: TicketActor, ticketId: string): Promise<Record<string, unknown>> {
    if (!UUID.test(ticketId)) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);
    return this.database.transaction(actor, async (tx) => {
      const found = await tx.query<ListRow & { description: string; reporter_name: string | null; reporter_email: string | null; student_ref: string | null }>(
        `SELECT ${ROW_SELECT}, t.description, d.name AS department_name,
                (extract(epoch FROM t.first_response_due_at) * 1000)::bigint AS first_due_ms,
                (extract(epoch FROM t.resolution_due_at) * 1000)::bigint AS resolution_due_ms,
                (extract(epoch FROM t.created_at) * 1000)::bigint AS created_ms,
                (extract(epoch FROM t.updated_at) * 1000)::bigint AS updated_ms,
                u.display_name AS reporter_name, u.email AS reporter_email, s.roll_number AS student_ref
           FROM tickets.tickets t
           LEFT JOIN core.departments d ON d.tenant_id = t.tenant_id AND d.id = t.department_id
           LEFT JOIN core.users u ON u.tenant_id = t.tenant_id AND u.id = t.reporter_id
           LEFT JOIN core.students s ON s.tenant_id = t.tenant_id AND s.user_id = t.reporter_id
          WHERE t.tenant_id = $1::uuid AND t.id = $2::uuid`,
        [actor.tenantId, ticketId],
      );
      const row = found.rows[0];
      if (row === undefined) throw new TicketCommandError(ErrorCode.ACCESS_DENIED);

      const [history, messages, reveals] = await Promise.all([
        tx.query<{ at_ms: string | number; from_status: string | null; to_status: string; reason: string; kind: string }>(
          `SELECT (extract(epoch FROM at) * 1000)::bigint AS at_ms, from_status, to_status, reason, kind
             FROM tickets.ticket_history WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid ORDER BY at, id`,
          [actor.tenantId, ticketId],
        ),
        tx.query<{ id: string; body: string; visibility: string; is_first: boolean; created_ms: string | number }>(
          `SELECT id::text AS id, body, visibility, is_first_public_response AS is_first,
                  (extract(epoch FROM created_at) * 1000)::bigint AS created_ms
             FROM tickets.ticket_messages WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid ORDER BY created_at, id`,
          [actor.tenantId, ticketId],
        ),
        tx.query<{ ticket_id: string; handler_id: string }>(
          `SELECT ticket_id::text AS ticket_id, handler_id::text AS handler_id
             FROM tickets.confidential_reveals WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [actor.tenantId, ticketId],
        ),
      ]);

      const item = toListItem(row);
      const historyItems: TicketHistoryItem[] = history.rows.map((h) => ({
        at: Number(h.at_ms),
        fromStatus: h.from_status,
        toStatus: h.to_status,
        reason: h.reason,
        kind: h.kind,
      }));
      const projectable = {
        ...item,
        id: row.id as TicketId,
        reporterId: row.reporter_id as UserId,
        confidential: row.confidential,
        anonRef: row.anon_ref,
        description: row.description,
        assigneeId: row.assignee_id,
        version: row.version,
        history: historyItems,
        reporter: { name: row.reporter_name ?? '', email: row.reporter_email ?? '', studentId: row.student_ref ?? '' },
        messages: messages.rows.map((m) => ({
          id: m.id,
          body: m.body,
          internal: m.visibility === 'internal',
          firstPublicResponse: m.is_first,
          createdAt: Number(m.created_ms),
        })),
      };
      const revealRecords: RevealRecord[] = reveals.rows.map((r) => ({
        ticketId: r.ticket_id as TicketId,
        handlerId: r.handler_id as UserId,
      }));
      const viewer = { userId: actor.userId, roles: actor.roles as readonly Role[] };
      return projectTicketForViewer(projectable, viewer, revealRecords, 'detail') as unknown as Record<string, unknown>;
    });
  }

  // ---- command handlers -------------------------------------------------------------------------------------

  private async applyDomain(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
    input: TicketCommandInput,
    now: Instant,
  ): Promise<TicketCommandResult> {
    const ticket = toDomainTicket(row);
    const domainActor: Actor = { kind: 'user', userId: actor.userId, roles: actor.roles as readonly Role[] };
    const command = await this.buildCommand(tx, actor, row, input);
    const result = applyCommand(ticket, command, domainActor, now);
    if (!result.ok) throw TicketCommandError.fromRejection(result.rejection.code);

    const next = result.ticket;
    const entry = result.historyEntry;
    const updated = await tx.query<{ version: number }>(
      `UPDATE tickets.tickets SET status = $3, assignee_id = $4::uuid, owner_level = $5, resolver_id = $6::uuid,
              resolved_at = CASE WHEN $7::double precision IS NULL THEN NULL ELSE to_timestamp($7::double precision / 1000.0) END,
              closure_reason = $8, auto_confirmed = $9, rating = $10, sla_budget_factor = $11,
              is_open = ($3 <> 'Closed'), version = version + 1, updated_at = to_timestamp($12::double precision / 1000.0)
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND version = $13
        RETURNING version`,
      [
        actor.tenantId,
        row.id,
        next.status,
        next.assigneeId,
        next.ownerLevel,
        next.resolverId,
        next.resolvedAt,
        next.closureReason,
        next.autoConfirmed,
        next.rating,
        next.slaBudgetFactor,
        now,
        row.version,
      ],
    );
    const version = updated.rows[0]?.version;
    if (version === undefined) throw new TicketCommandError(ErrorCode.VERSION_CONFLICT);

    await tx.query(
      `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason, kind)
       VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), $5, $6, $7, 'status')`,
      [actor.tenantId, row.id, entry.actorId, entry.at, entry.fromStatus, entry.toStatus, entry.reason],
    );

    for (const event of result.events) {
      if (event.type === 'TicketStatusChanged') {
        await enqueueEvent(
          tx,
          {
            type: 'TicketStatusChanged',
            version: 1,
            tenantId: actor.tenantId,
            payload: { ticketId: row.id, fromStatus: event.from, toStatus: event.to, actorId: entry.actorId },
          },
          () => now,
        );
      } else {
        await enqueueEvent(
          tx,
          {
            type: 'TicketAssignmentChanged',
            version: 1,
            tenantId: actor.tenantId,
            payload: { ticketId: row.id, assigneeId: event.assigneeId },
          },
          () => now,
        );
      }
    }
    await this.syncTimers(tx, actor, row, next, now);

    await this.audit.record(tx, actor.tenantId, {
      actor: actor.userId,
      role: roleCode(actor),
      action: auditCode(`ticket.${input.type}`),
      target: `ticket:${row.id}`,
      outcome: 'success',
      details: {
        from: auditCode(entry.fromStatus.replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 64)),
        to: auditCode(entry.toStatus.replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 64)),
      },
      timestampMs: now,
    });
    return toResult(row.id, next.status, row.band, next.assigneeId, num(row.eta_ms), version);
  }

  private async buildCommand(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
    input: TicketCommandInput,
  ): Promise<TicketCommand> {
    const reason = input.reason === undefined ? undefined : validReason(input.reason);
    const withReason = reason === undefined ? {} : { reason };
    switch (input.type) {
      case 'assign': {
        if (typeof input.assigneeId !== 'string' || !UUID.test(input.assigneeId)) {
          invalid([{ path: 'assigneeId', rule: 'format', expected: 'uuid' }]);
        }
        await this.requireHandlerIn(tx, actor, input.assigneeId, row.department_id);
        return { type: 'assign', assigneeId: input.assigneeId as UserId, ...withReason };
      }
      case 'start':
      case 'await_student':
      case 'student_respond':
      case 'resume':
      case 'resolve':
        return { type: input.type, ...withReason };
      case 'confirm':
        return { type: 'confirm', rating: input.rating as number };
      case 'withdraw':
        return { type: 'withdraw' };
      case 'reopen':
        return { type: 'reopen', reason: validReason(input.reason) };
      case 'dispute': {
        const { handlers, deptHeadId } = await this.disputeCandidates(tx, actor, row);
        return { type: 'dispute', reason: validReason(input.reason), handlers, deptHeadId };
      }
      default:
        throw new TicketCommandError(ErrorCode.INVALID_TRANSITION);
    }
  }

  private async changeBand(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
    input: TicketCommandInput,
    now: Instant,
  ): Promise<TicketCommandResult> {
    if (!isStaff(actor)) throw new TicketCommandError(ErrorCode.INSUFFICIENT_PERMISSION);
    if (row.status === 'Closed') throw new TicketCommandError(ErrorCode.TICKET_CLOSED);
    if (!PRIORITY_BANDS.includes(input.band as PriorityBand)) {
      invalid([{ path: 'band', rule: 'enum', allowed: PRIORITY_BANDS }]);
    }
    const reason = validReason(input.reason);
    const band = input.band as PriorityBand;
    const version = await this.bump(tx, actor, row, 'band = $3', [band], now);
    await tx.query(
      `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason, kind)
       VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), $5, $5, $6, 'band')`,
      [actor.tenantId, row.id, actor.userId, now, row.status, reason],
    );
    await enqueueEvent(
      tx,
      {
        type: 'TicketPriorityChanged',
        version: 1,
        tenantId: actor.tenantId,
        payload: { ticketId: row.id, fromBand: row.band, toBand: band },
      },
      () => now,
    );
    await this.audit.record(tx, actor.tenantId, {
      actor: actor.userId,
      role: roleCode(actor),
      action: auditCode('ticket.priority_changed'),
      target: `ticket:${row.id}`,
      outcome: 'success',
      details: { fromBand: auditCode(row.band), toBand: auditCode(band) },
      timestampMs: now,
    });
    return toResult(row.id, row.status, band, row.assignee_id, num(row.eta_ms), version);
  }

  private async setEta(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
    input: TicketCommandInput,
    now: Instant,
  ): Promise<TicketCommandResult> {
    if (!isStaff(actor)) throw new TicketCommandError(ErrorCode.INSUFFICIENT_PERMISSION);
    if (row.status === 'Closed') throw new TicketCommandError(ErrorCode.TICKET_CLOSED);
    const eta = input.eta;
    if (typeof eta !== 'number' || !Number.isFinite(eta) || eta <= now || eta > now + MAX_ETA_AHEAD_MS) {
      invalid([{ path: 'eta', rule: 'invalid' }]);
    }
    const etaMs = Math.floor(eta as number);
    const version = await this.bump(
      tx,
      actor,
      row,
      'eta = to_timestamp($3::double precision / 1000.0), eta_set_by = $4::uuid',
      [etaMs, actor.userId],
      now,
    );
    await tx.query(
      `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason, kind)
       VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), $5, $5, 'ETA set', 'eta')`,
      [actor.tenantId, row.id, actor.userId, now, row.status],
    );
    await this.audit.record(tx, actor.tenantId, {
      actor: actor.userId,
      role: roleCode(actor),
      action: auditCode('ticket.eta_set'),
      target: `ticket:${row.id}`,
      outcome: 'success',
      timestampMs: now,
    });
    return toResult(row.id, row.status, row.band, row.assignee_id, etaMs, version);
  }

  // ---- helpers ----------------------------------------------------------------------------------------------

  /** Updates the given columns, bumps the version and `updated_at`. `set` uses $3 onward for `params`. */
  private async bump(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
    set: string,
    params: readonly unknown[],
    now: Instant,
  ): Promise<number> {
    const base = 2 + params.length;
    const result = await tx.query<{ version: number }>(
      `UPDATE tickets.tickets SET ${set}, version = version + 1, updated_at = to_timestamp($${base + 1}::double precision / 1000.0)
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND version = $${base + 2}
        RETURNING version`,
      [actor.tenantId, row.id, ...params, now, row.version],
    );
    const version = result.rows[0]?.version;
    if (version === undefined) throw new TicketCommandError(ErrorCode.VERSION_CONFLICT);
    return version;
  }

  private async lock(tx: TicketSqlClient, ticketId: string): Promise<TicketRow | undefined> {
    const result = await tx.query<TicketRow>(
      `SELECT ${ROW_SELECT} FROM tickets.tickets t WHERE t.id = $1::uuid FOR UPDATE`,
      [ticketId],
    );
    return result.rows[0];
  }

  /** Students whose enrolment is inactive keep read access but cannot write (17.9). */
  private async requireActiveEnrolment(tx: TicketSqlClient, actor: TicketActor): Promise<void> {
    if (!isStudentOnly(actor)) return;
    const result = await tx.query<{ enrolment_status: string }>(
      `SELECT enrolment_status FROM core.students WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [actor.tenantId, actor.userId],
    );
    if (result.rows[0]?.enrolment_status !== 'active') {
      throw new TicketCommandError(ErrorCode.INSUFFICIENT_PERMISSION);
    }
  }

  private async requireHandlerIn(
    tx: TicketSqlClient,
    actor: TicketActor,
    assigneeId: string,
    departmentId: string | null,
  ): Promise<void> {
    const result = await tx.query(
      `SELECT 1 FROM core.user_roles r
         JOIN core.user_departments d ON d.tenant_id = r.tenant_id AND d.user_id = r.user_id
        WHERE r.tenant_id = $1::uuid AND r.user_id = $2::uuid AND r.role = 'handler' AND d.department_id = $3::uuid`,
      [actor.tenantId, assigneeId, departmentId],
    );
    if (result.rows.length === 0) invalid([{ path: 'assigneeId', rule: 'tenant_member' }]);
  }

  private async disputeCandidates(
    tx: TicketSqlClient,
    actor: TicketActor,
    row: TicketRow,
  ): Promise<{ handlers: HandlerCandidate[]; deptHeadId: UserId }> {
    const handlers = await tx.query<{ user_id: string; open_count: string | number }>(
      `SELECT r.user_id::text AS user_id,
              (SELECT count(*) FROM tickets.tickets x
                WHERE x.tenant_id = r.tenant_id AND x.assignee_id = r.user_id AND x.is_open) AS open_count
         FROM core.user_roles r
         JOIN core.user_departments d ON d.tenant_id = r.tenant_id AND d.user_id = r.user_id
        WHERE r.tenant_id = $1::uuid AND r.role = 'handler' AND d.department_id = $2::uuid`,
      [actor.tenantId, row.department_id],
    );
    const head = await tx.query<{ user_id: string }>(
      `SELECT r.user_id::text AS user_id FROM core.user_roles r
         JOIN core.user_departments d ON d.tenant_id = r.tenant_id AND d.user_id = r.user_id
        WHERE r.tenant_id = $1::uuid AND r.role = 'dept_head' AND d.department_id = $2::uuid
        ORDER BY r.user_id LIMIT 1`,
      [actor.tenantId, row.department_id],
    );
    const deptHeadId = head.rows[0]?.user_id ?? row.assignee_id;
    if (deptHeadId === null || deptHeadId === undefined) throw new TicketCommandError(ErrorCode.INVALID_TRANSITION);
    return {
      handlers: handlers.rows.map((h) => ({ userId: h.user_id as UserId, openTicketCount: Number(h.open_count) })),
      deptHeadId: deptHeadId as UserId,
    };
  }

  /** Keeps the confirmation-window and awaiting-Student timers in step with the new status. */
  private async syncTimers(
    tx: TicketSqlClient,
    actor: TicketActor,
    before: TicketRow,
    next: Ticket,
    now: Instant,
  ): Promise<void> {
    const key = (kind: string) => ({ tenantId: actor.tenantId, ticketId: before.id, kind });
    if (next.status === 'Resolved (Pending Confirmation)' && next.resolvedAt !== null) {
      await upsertTimer(tx, key('confirmation_window_end'), next.resolvedAt + CONFIRMATION_WINDOW_MS);
    } else if (before.status === 'Resolved (Pending Confirmation)') {
      await cancelTimer(tx, key('confirmation_window_end'));
    }
    if (next.status === 'Awaiting Student') {
      await upsertTimer(tx, key('awaiting_student_7d'), now + AWAITING_STUDENT_MS);
    } else if (before.status === 'Awaiting Student') {
      await cancelTimer(tx, key('awaiting_student_7d'));
    }
  }
}

interface ListRow extends TicketRow {
  department_name: string | null;
  first_due_ms: string | number | null;
  resolution_due_ms: string | number | null;
  created_ms: string | number;
  updated_ms: string | number;
}

function toListItem(row: ListRow): TicketListItem {
  return {
    id: row.id,
    ref: row.ref,
    type: row.type,
    title: row.title,
    status: row.status,
    band: row.band,
    department:
      row.department_id === null ? null : { id: row.department_id, name: row.department_name ?? '' },
    firstResponseDueAt: num(row.first_due_ms),
    resolutionDueAt: num(row.resolution_due_ms),
    eta: num(row.eta_ms),
    createdAt: Number(row.created_ms),
    updatedAt: Number(row.updated_ms),
  };
}

function toResult(
  ticketId: string,
  status: string,
  band: PriorityBand,
  assigneeId: string | null,
  eta: number | null,
  version: number,
): TicketCommandResult {
  return { ticketId, status, band, assigneeId, eta, version };
}
