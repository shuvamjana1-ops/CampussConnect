// Staff_Workbench queue, triage confirmation and correction, and the AI override rate (task 18.6;
// requirements 7.1 to 7.5, 7.10, 25.5, 25.6). Reads and writes run under the actor's row-level security context.

import { ErrorCode, normaliseText, textLength, type FieldError } from '@campusconnect/contracts';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import type { Instant } from '@campusconnect/domain/types';
import { QUEUE_PAGE_SIZE } from '@campusconnect/domain/workbench';
import { AuditService } from '../audit';
import { auditCode, auditRef } from '../audit/audit.types';
import { enqueueEvent } from '../outbox';
import { PRIORITY_BANDS, type PriorityBand } from '../tenancy';
import type { TicketActor, TicketDatabase, TicketSqlClient } from '../tickets';
import {
  OVERRIDE_WINDOW_DAYS,
  WorkbenchError,
  type OverrideRateRow,
  type QueueItemView,
  type QueuePage,
  type QueueQuery,
  type TriageActionResult,
  type TriageCorrectionInput,
} from './workbench.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REASON_MAX_LENGTH = 500;
const DEFAULT_REASON = 'Triage corrected by Handler';
const LABEL_TEXT_MAX_LENGTH = 25_000;

/** Needs_Verification_Lane membership (G15): unconfirmed, below threshold, fallback, or pending manual triage. */
const LANE_CONDITION = `(t.flags ->> 'needsVerification' = 'true' OR t.flags ->> 'pendingManualTriage' = 'true')`;

/** Queue sort key: paused Tickets and Tickets without a due time sort last within their band (7.1). */
const DUE_KEY = `(CASE WHEN c.state = 'paused' THEN 'infinity'::timestamptz
                       ELSE COALESCE(t.sort_due_at, 'infinity'::timestamptz) END)`;

const BREACHED = `COALESCE(c.resolution_due_at < now() OR (c.first_response_due_at < now() AND c.first_response_at IS NULL), false)`;
const AT_RISK = `COALESCE(c.at_risk_at <= now(), false)`;

export interface WorkbenchServiceOptions {
  readonly database: TicketDatabase;
  readonly audit: AuditService;
  readonly redactor: PiiRedactor;
  readonly now?: () => Instant;
}

interface QueueRow {
  id: string;
  ref: string;
  type: string;
  title: string;
  status: string;
  band: PriorityBand;
  confidential: boolean;
  anon_ref: string | null;
  department_id: string | null;
  assignee_id: string | null;
  band_rank: number;
  due_key: string;
  due_ms: string | number | null;
  created_key: string;
  created_ms: string | number;
  paused: boolean;
  breached: boolean;
  at_risk: boolean;
  flags: Record<string, unknown> | null;
}

interface Cursor {
  readonly b: number;
  readonly d: string;
  readonly c: string;
  readonly i: string;
}

interface TriageRow {
  id: string;
  status: string;
  is_open: boolean;
  band: PriorityBand;
  category_id: string;
  department_id: string | null;
  assignee_id: string | null;
  version: number;
  flags: Record<string, unknown> | null;
  ai_category_id: string | null;
  ai_category_confidence: string | number | null;
  ai_department_id: string | null;
  ai_department_confidence: string | number | null;
  ai_band: PriorityBand | null;
}

const hasRole = (actor: TicketActor, ...roles: readonly string[]): boolean => roles.some((r) => actor.roles.includes(r));
const isStaff = (actor: TicketActor): boolean => hasRole(actor, 'handler', 'dept_head');
const roleCode = (actor: TicketActor): ReturnType<typeof auditCode> =>
  auditCode(actor.roles.find((r) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u.test(r)) ?? 'unknown');

function requireStaff(actor: TicketActor): void {
  if (!isStaff(actor)) throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
}

function invalid(fields: FieldError[]): never {
  throw new WorkbenchError(ErrorCode.VALIDATION_FAILED, fields);
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor> | null;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      Number.isInteger(parsed.b) &&
      typeof parsed.d === 'string' &&
      Number.isFinite(Date.parse(parsed.d === 'infinity' ? '2100-01-01' : parsed.d)) &&
      typeof parsed.c === 'string' &&
      Number.isFinite(Date.parse(parsed.c)) &&
      typeof parsed.i === 'string' &&
      UUID.test(parsed.i)
    ) {
      return parsed as Cursor;
    }
  } catch {
    // Falls through to the validation error.
  }
  return invalid([{ path: 'cursor', rule: 'invalid' }]);
}

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

function toItem(row: QueueRow): QueueItemView {
  const flags = row.flags ?? {};
  return {
    id: row.id,
    ref: row.ref,
    type: row.type,
    title: row.title,
    status: row.status,
    band: row.band,
    confidential: row.confidential,
    anonRef: row.anon_ref,
    departmentId: row.department_id,
    assigneeId: row.assignee_id,
    sortDueAt: num(row.due_ms),
    createdAt: Number(row.created_ms),
    paused: row.paused,
    // A Breached Ticket shows only "Breached"; "At risk" applies before the due time (7.2).
    atRisk: row.at_risk && !row.breached,
    breached: row.breached,
    escalationFailed: flags['escalationFailed'] === true,
    needsVerification: flags['needsVerification'] === true || flags['pendingManualTriage'] === true,
  };
}

export class WorkbenchService {
  private readonly now: () => Instant;

  constructor(private readonly o: WorkbenchServiceOptions) {
    this.now = o.now ?? ((): Instant => Date.now() as Instant);
  }

  /** `GET /workbench/queue`: 50 rows per page in queue order, plus the Needs_Verification_Lane count (7.1 to 7.3). */
  async queue(actor: TicketActor, query: QueueQuery = {}): Promise<QueuePage> {
    requireStaff(actor);
    const lane = query.lane ?? 'mine';
    if (lane !== 'mine' && lane !== 'needs_verification') {
      invalid([{ path: 'lane', rule: 'enum', allowed: ['mine', 'needs_verification'] }]);
    }
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

    return this.o.database.transaction(actor, async (tx) => {
      const params: unknown[] = [actor.tenantId];
      let where = `t.tenant_id = $1::uuid AND t.is_open`;
      if (lane === 'mine') {
        params.push(actor.userId);
        where += ` AND t.assignee_id = $${params.length}::uuid`;
      } else {
        where += ` AND ${LANE_CONDITION}`;
      }
      if (cursor !== undefined) {
        params.push(cursor.b, cursor.d, cursor.c, cursor.i);
        const n = params.length;
        where += ` AND (t.band_rank, ${DUE_KEY}, t.created_at, t.id) >
          ($${n - 3}::smallint, $${n - 2}::timestamptz, $${n - 1}::timestamptz, $${n}::uuid)`;
      }
      const rows = (
        await tx.query<QueueRow>(
          `SELECT t.id::text AS id, t.ref, t.type, t.title, t.status, t.band, t.confidential, t.anon_ref,
                  t.department_id::text AS department_id, t.assignee_id::text AS assignee_id, t.band_rank,
                  ${DUE_KEY}::text AS due_key,
                  (extract(epoch FROM t.sort_due_at) * 1000)::bigint AS due_ms,
                  t.created_at::text AS created_key,
                  (extract(epoch FROM t.created_at) * 1000)::bigint AS created_ms,
                  COALESCE(c.state = 'paused', false) AS paused,
                  ${BREACHED} AS breached, ${AT_RISK} AS at_risk, t.flags
           FROM tickets.tickets t
           LEFT JOIN sla.sla_clocks c ON c.tenant_id = t.tenant_id AND c.ticket_id = t.id
           WHERE ${where}
           ORDER BY t.band_rank, ${DUE_KEY}, t.created_at, t.id
           LIMIT ${QUEUE_PAGE_SIZE + 1}`,
          params,
        )
      ).rows;

      const page = rows.slice(0, QUEUE_PAGE_SIZE);
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > QUEUE_PAGE_SIZE && last !== undefined
          ? encodeCursor({ b: last.band_rank, d: last.due_key, c: last.created_key, i: last.id })
          : null;

      const count = await tx.query<{ n: string | number }>(
        `SELECT count(*) AS n FROM tickets.tickets t
         WHERE t.tenant_id = $1::uuid AND t.is_open AND ${LANE_CONDITION}`,
        [actor.tenantId],
      );
      return {
        items: page.map(toItem),
        nextCursor,
        needsVerificationCount: Number(count.rows[0]?.n ?? 0),
      };
    });
  }

  /** `POST /tickets/{id}/triage/confirm`: accepts the current category, band and department (7.4). */
  confirm(actor: TicketActor, ticketId: string): Promise<TriageActionResult> {
    return this.apply(actor, ticketId, 'confirm', {});
  }

  /** `POST /tickets/{id}/triage/correct`: changes category, band and/or department in one action (7.4). */
  correct(actor: TicketActor, ticketId: string, input: TriageCorrectionInput): Promise<TriageActionResult> {
    return this.apply(actor, ticketId, 'correct', input);
  }

  /**
   * `GET /workbench/override-rate`: per category over a rolling 30 days, corrected suggestions divided by suggestions.
   * Dept_Head only. The query has no Handler dimension, so a per-Handler rate cannot be returned (7.5).
   */
  async overrideRate(actor: TicketActor): Promise<readonly OverrideRateRow[]> {
    if (!hasRole(actor, 'dept_head')) throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    return this.o.database.transaction(actor, async (tx) => {
      const rows = (
        await tx.query<{ category_id: string; name: string; suggestions: string | number; corrected: string | number }>(
          `SELECT r.category_id::text AS category_id, cat.name,
                  count(*) AS suggestions,
                  count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM workbench.training_labels l
                    WHERE l.tenant_id = r.tenant_id AND l.ticket_id = r.ticket_id AND l.kind = 'correct'
                      AND l.created_at >= now() - make_interval(days => $2::int))) AS corrected
           FROM triage.triage_results r
           JOIN core.categories cat ON cat.tenant_id = r.tenant_id AND cat.id = r.category_id
           WHERE r.tenant_id = $1::uuid AND r.source = 'ai'
             AND r.created_at >= now() - make_interval(days => $2::int)
           GROUP BY r.category_id, cat.name
           ORDER BY cat.name`,
          [actor.tenantId, OVERRIDE_WINDOW_DAYS],
        )
      ).rows;
      return rows.map((r) => {
        const suggestions = Number(r.suggestions);
        const corrected = Number(r.corrected);
        return {
          categoryId: r.category_id,
          categoryName: r.name,
          suggestions,
          corrected,
          rate: suggestions === 0 ? 0 : corrected / suggestions,
        };
      });
    });
  }

  private async apply(
    actor: TicketActor,
    ticketId: string,
    kind: 'confirm' | 'correct',
    input: TriageCorrectionInput,
  ): Promise<TriageActionResult> {
    requireStaff(actor);
    if (!UUID.test(ticketId)) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
    const request = this.validate(kind, input);

    // Redaction runs before the row lock so the lock is not held while the redactor works (25.6).
    const source = await this.o.database.transaction(actor, async (tx) => {
      const ticket = await tx.query<{ text: string }>(
        `SELECT t.title || E'\\n' || t.description AS text FROM tickets.tickets t
         WHERE t.tenant_id = $1::uuid AND t.id = $2::uuid`,
        [actor.tenantId, ticketId],
      );
      const row = ticket.rows[0];
      if (row === undefined) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
      const config = await tx.query<{ opt_in: boolean }>(
        `SELECT training_label_opt_in AS opt_in FROM core.tenant_config WHERE tenant_id = $1::uuid`,
        [actor.tenantId],
      );
      return { text: row.text, optedIn: config.rows[0]?.opt_in === true };
    });
    const redactedText = source.optedIn ? await this.redactForLabel(actor.tenantId, source.text) : null;

    const now = this.now();
    return this.o.database.transaction(actor, async (tx) => {
      const found = await tx.query<TriageRow>(
        `SELECT t.id::text AS id, t.status, t.is_open, t.band, t.category_id::text AS category_id,
                t.department_id::text AS department_id, t.assignee_id::text AS assignee_id, t.version, t.flags,
                r.category_id::text AS ai_category_id, r.category_confidence AS ai_category_confidence,
                r.department_id::text AS ai_department_id, r.department_confidence AS ai_department_confidence,
                r.band AS ai_band
         FROM tickets.tickets t
         LEFT JOIN triage.triage_results r ON r.tenant_id = t.tenant_id AND r.ticket_id = t.id
         WHERE t.tenant_id = $1::uuid AND t.id = $2::uuid
         FOR UPDATE OF t`,
        [actor.tenantId, ticketId],
      );
      const row = found.rows[0];
      if (row === undefined) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
      if (!row.is_open || row.status === 'Closed') throw new WorkbenchError(ErrorCode.TICKET_CLOSED);

      const categoryId = request.categoryId ?? row.category_id;
      const band = request.band ?? row.band;
      const departmentId = request.departmentId ?? row.department_id;
      const departmentChanged = request.departmentId !== undefined && request.departmentId !== row.department_id;
      const bandChanged = band !== row.band;

      if (request.categoryId !== undefined && request.categoryId !== row.category_id) {
        const category = await tx.query(
          `SELECT 1 FROM core.categories WHERE tenant_id = $1::uuid AND id = $2::uuid AND active`,
          [actor.tenantId, categoryId],
        );
        if (category.rows.length === 0) invalid([{ path: 'categoryId', rule: 'unknown' }]);
      }
      if (departmentChanged) {
        if (!(actor.departmentIds ?? []).includes(request.departmentId as string)) {
          throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
        }
        if (row.status !== 'New' && row.status !== 'Assigned') {
          invalid([{ path: 'departmentId', rule: 'status' }]);
        }
        const department = await tx.query(
          `SELECT 1 FROM core.departments WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [actor.tenantId, departmentId],
        );
        if (department.rows.length === 0) invalid([{ path: 'departmentId', rule: 'unknown' }]);
      }

      // A department change returns the Ticket to the department's routing (no assignee, status New).
      const nextStatus = departmentChanged ? 'New' : row.status;
      const nextAssignee = departmentChanged ? null : row.assignee_id;
      const flags = { ...(row.flags ?? {}), needsVerification: false } as Record<string, unknown>;
      delete flags['pendingManualTriage'];
      if (departmentChanged) flags['unassigned'] = true;

      const updated = await tx.query<{ version: number }>(
        `UPDATE tickets.tickets
         SET category_id = $3::uuid, band = $4, department_id = $5::uuid, assignee_id = $6::uuid, status = $7,
             flags = $8::jsonb, version = version + 1, updated_at = to_timestamp($9::double precision / 1000.0)
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         RETURNING version`,
        [actor.tenantId, ticketId, categoryId, band, departmentId, nextAssignee, nextStatus, JSON.stringify(flags), now],
      );
      const version = updated.rows[0]?.version;
      if (version === undefined) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);

      if (bandChanged) {
        await this.history(tx, actor, ticketId, row.status, row.status, request.reason, 'band', now);
        await enqueueEvent(
          tx,
          {
            type: 'TicketPriorityChanged',
            version: 1,
            tenantId: actor.tenantId,
            payload: { ticketId, fromBand: row.band, toBand: band },
          },
          () => now,
        );
      }
      if (departmentChanged) {
        await this.history(tx, actor, ticketId, row.status, 'New', request.reason, 'status', now);
      }

      await this.writeLabels(tx, actor, ticketId, redactedText, [
        {
          field: 'category',
          original: row.ai_category_id ?? row.category_id,
          corrected: categoryId,
          confidence: num(row.ai_category_confidence),
        },
        { field: 'band', original: row.ai_band ?? row.band, corrected: band, confidence: null },
        {
          field: 'department',
          original: row.ai_department_id ?? row.department_id ?? 'unassigned',
          corrected: departmentId ?? 'unassigned',
          confidence: num(row.ai_department_confidence),
        },
      ]);

      await this.o.audit.record(tx, actor.tenantId, {
        actor: actor.userId,
        role: roleCode(actor),
        action: auditCode(kind === 'confirm' ? 'ticket.triage_confirmed' : 'ticket.triage_corrected'),
        target: `ticket:${ticketId}`,
        outcome: 'success',
        details: {
          fromBand: auditCode(row.band),
          toBand: auditCode(band),
          category: auditRef(categoryId),
        },
        timestampMs: now,
      });

      return { ticketId, categoryId, band, departmentId, assigneeId: nextAssignee, version };
    });
  }

  private validate(
    kind: 'confirm' | 'correct',
    input: TriageCorrectionInput,
  ): { categoryId?: string; band?: PriorityBand; departmentId?: string; reason: string } {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      invalid([{ path: '', rule: 'type', expected: 'object' }]);
    }
    const allowed = kind === 'confirm' ? [] : ['categoryId', 'band', 'departmentId', 'reason'];
    const extra = Object.keys(input).filter((k) => !allowed.includes(k));
    if (extra.length > 0) invalid(extra.map((k): FieldError => ({ path: k, rule: 'unknown_field' })));

    const fields: FieldError[] = [];
    if (input.categoryId !== undefined && (typeof input.categoryId !== 'string' || !UUID.test(input.categoryId))) {
      fields.push({ path: 'categoryId', rule: 'uuid' });
    }
    if (input.departmentId !== undefined && (typeof input.departmentId !== 'string' || !UUID.test(input.departmentId))) {
      fields.push({ path: 'departmentId', rule: 'uuid' });
    }
    if (input.band !== undefined && !PRIORITY_BANDS.includes(input.band)) {
      fields.push({ path: 'band', rule: 'enum', allowed: PRIORITY_BANDS });
    }
    let reason = DEFAULT_REASON;
    if (input.reason !== undefined) {
      const text = typeof input.reason === 'string' ? normaliseText(input.reason, { trim: true }) : '';
      if (typeof input.reason !== 'string' || textLength(text) < 1 || textLength(text) > REASON_MAX_LENGTH) {
        fields.push({ path: 'reason', rule: 'length', min: 1, max: REASON_MAX_LENGTH });
      } else {
        reason = text;
      }
    }
    if (kind === 'correct' && input.categoryId === undefined && input.band === undefined && input.departmentId === undefined) {
      fields.push({ path: '', rule: 'required', oneOf: ['categoryId', 'band', 'departmentId'] });
    }
    if (fields.length > 0) invalid(fields);
    return {
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      ...(input.band === undefined ? {} : { band: input.band }),
      ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
      reason,
    };
  }

  /** Redacted Ticket text for the training label, or null when redaction fails (25.6). */
  private async redactForLabel(tenantId: string, text: string): Promise<string | null> {
    try {
      const redacted = String((await this.o.redactor.redact(text, { tenantId })).text);
      return redacted.length === 0 ? null : redacted.slice(0, LABEL_TEXT_MAX_LENGTH);
    } catch {
      return null;
    }
  }

  private async history(
    tx: TicketSqlClient,
    actor: TicketActor,
    ticketId: string,
    from: string,
    to: string,
    reason: string,
    kind: 'status' | 'band',
    now: Instant,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason, kind)
       VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), $5, $6, $7, $8)`,
      [actor.tenantId, ticketId, actor.userId, now, from, to, reason, kind],
    );
  }

  /**
   * One label per field. Text enters the training set only when the Tenant opted in and redaction succeeded;
   * every other correction is excluded and counted per Tenant (25.5, 25.6).
   */
  private async writeLabels(
    tx: TicketSqlClient,
    actor: TicketActor,
    ticketId: string,
    redactedText: string | null,
    labels: readonly {
      readonly field: 'category' | 'band' | 'department';
      readonly original: string;
      readonly corrected: string;
      readonly confidence: number | null;
    }[],
  ): Promise<void> {
    let excluded = 0;
    for (const label of labels) {
      const kind = label.original === label.corrected ? 'confirm' : 'correct';
      if (kind === 'correct' && redactedText === null) excluded += 1;
      await tx.query(
        `INSERT INTO workbench.training_labels
           (tenant_id, ticket_id, field, kind, original_value, corrected_value, original_confidence, handler_id,
            redacted_text, eligible)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9, $10)`,
        [
          actor.tenantId,
          ticketId,
          label.field,
          kind,
          label.original,
          label.corrected,
          label.confidence,
          actor.userId,
          redactedText,
          redactedText !== null,
        ],
      );
    }
    if (excluded > 0) {
      await tx.query(
        `INSERT INTO workbench.training_exclusions (tenant_id, excluded_count)
         VALUES ($1::uuid, $2::bigint)
         ON CONFLICT (tenant_id) DO UPDATE
           SET excluded_count = workbench.training_exclusions.excluded_count + EXCLUDED.excluded_count,
               updated_at = now()`,
        [actor.tenantId, excluded],
      );
    }
  }
}
