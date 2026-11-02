// Confidentiality and Grievance Committee operations (task 15.8; requirements 3.8, 8.1 to 8.8). Identity reveals and
// decisions run in one transaction with their audit entry, so an audit failure cancels the change (8.8, 18.9).
// A refused identity access is audited in its own transaction, so the entry survives the refusal (8.7).

import { ErrorCode, normaliseText, textLength, type FieldError } from '@campusconnect/contracts';
import { l3ReviewDeadline, workingDaysRemaining } from '@campusconnect/domain/sla';
import type { IsoWeekday, WorkingCalendar, WorkingWindow } from '@campusconnect/domain/calendar';
import type { Instant } from '@campusconnect/domain/types';
import type { PiiRedactor, RedactedText } from '@campusconnect/pii-redactor';
import { AuditService } from '../audit';
import { auditCode, auditRef } from '../audit/audit.types';
import { enqueueEvent } from '../outbox';
import {
  DECISION_MAX_LENGTH,
  DECISION_RATIONALE_MAX_LENGTH,
  DECISION_RATIONALE_MIN_LENGTH,
  DEFAULT_DECISION,
  GrievanceError,
  REVEAL_REASON_MAX_LENGTH,
  REVEAL_REASON_MIN_LENGTH,
  type DecisionInput,
  type DecisionResult,
  type L3GrievanceItem,
  type ReporterIdentity,
  type RevealInput,
  type RevealResult,
} from './grievances.types';
import type { TicketActor, TicketDatabase, TicketSqlClient } from './tickets.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DECISION_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;
const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export interface GrievanceServiceOptions {
  readonly database: TicketDatabase;
  readonly audit: AuditService;
  readonly redactor: PiiRedactor;
  readonly now?: () => Instant;
}

const isOmbudsperson = (actor: TicketActor): boolean => actor.roles.includes('ombudsperson');
const roleCode = (actor: TicketActor): ReturnType<typeof auditCode> =>
  auditCode(actor.roles.find((r) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u.test(r)) ?? 'unknown');

function invalid(fields: FieldError[]): never {
  throw new GrievanceError(ErrorCode.VALIDATION_FAILED, fields);
}

function isAuditFailure(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'AUDIT_UNAVAILABLE';
}

interface L3Row {
  id: string;
  ref: string;
  anon_ref: string | null;
  title: string;
  status: string;
  band: string;
  escalated_ms: string | number | null;
}

interface CalendarRow {
  time_zone: string;
  weekly: Partial<Record<string, readonly WorkingWindow[]>>;
  holidays: string[];
}

export class GrievanceService {
  private readonly database: TicketDatabase;
  private readonly audit: AuditService;
  private readonly redactor: PiiRedactor;
  private readonly now: () => Instant;

  constructor(options: GrievanceServiceOptions) {
    this.database = options.database;
    this.audit = options.audit;
    this.redactor = options.redactor;
    this.now = options.now ?? ((): Instant => Date.now() as Instant);
  }

  /** `POST /grievances/{id}/reveals`: the Ombudsperson reveals a confidential identity to one named Handler. */
  async reveal(actor: TicketActor, grievanceId: string, input: RevealInput): Promise<RevealResult> {
    if (!UUID.test(grievanceId)) throw new GrievanceError(ErrorCode.ACCESS_DENIED);
    if (!isOmbudsperson(actor)) return this.refuse(actor, grievanceId);

    const fields: FieldError[] = [];
    if (typeof input?.handlerId !== 'string' || !UUID.test(input.handlerId)) {
      fields.push({ path: 'handlerId', rule: 'format', expected: 'uuid' });
    }
    const reason = typeof input?.reason === 'string' ? normaliseText(input.reason, { trim: true }) : '';
    if (typeof input?.reason !== 'string' || textLength(reason) < REVEAL_REASON_MIN_LENGTH || textLength(reason) > REVEAL_REASON_MAX_LENGTH) {
      fields.push({ path: 'reason', rule: 'length', min: REVEAL_REASON_MIN_LENGTH, max: REVEAL_REASON_MAX_LENGTH });
    }
    if (fields.length > 0) invalid(fields);

    const redacted = await this.redactReason(actor, reason);
    const nowMs = this.now();

    try {
      return await this.database.transaction(actor, async (tx) => {
        const ticket = await tx.query<{ confidential: boolean }>(
          `SELECT confidential FROM tickets.tickets WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
          [actor.tenantId, grievanceId],
        );
        const row = ticket.rows[0];
        if (row === undefined) throw new GrievanceError(ErrorCode.ACCESS_DENIED);
        if (!row.confidential) invalid([{ path: 'id', rule: 'not_confidential' }]);

        const handler = await tx.query(
          `SELECT 1 FROM core.user_roles WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role = 'handler' LIMIT 1`,
          [actor.tenantId, input.handlerId],
        );
        if (handler.rows.length === 0) invalid([{ path: 'handlerId', rule: 'tenant_member' }]);

        await tx.query(
          `INSERT INTO tickets.confidential_reveals (tenant_id, ticket_id, handler_id, ombudsperson_id, reason_redacted, at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, to_timestamp($6::double precision / 1000.0))
           ON CONFLICT (tenant_id, ticket_id, handler_id)
           DO UPDATE SET ombudsperson_id = EXCLUDED.ombudsperson_id, reason_redacted = EXCLUDED.reason_redacted, at = EXCLUDED.at`,
          [actor.tenantId, grievanceId, input.handlerId, actor.userId, redacted, nowMs],
        );
        // Must be the last write that can fail: an audit failure throws and rolls the reveal back (8.8).
        await this.audit.record(tx, actor.tenantId, {
          actor: actor.userId,
          role: roleCode(actor),
          action: auditCode('grievance.identity_revealed'),
          target: `ticket:${grievanceId}`,
          outcome: 'success',
          details: { handler: auditRef(input.handlerId), reason: redacted },
          timestampMs: nowMs,
        });
        return { ticketId: grievanceId, handlerId: input.handlerId, at: nowMs };
      });
    } catch (error) {
      if (isAuditFailure(error)) throw new GrievanceError(ErrorCode.AUDIT_UNAVAILABLE);
      throw error;
    }
  }

  /**
   * `GET /grievances/{id}/identity`: the reporter's identity for the reporter, an Ombudsperson or a revealed Handler.
   * Row-level security on the reporter link decides; anyone else is refused and audited (8.7).
   */
  async getIdentity(actor: TicketActor, grievanceId: string): Promise<ReporterIdentity> {
    if (!UUID.test(grievanceId)) throw new GrievanceError(ErrorCode.ACCESS_DENIED);
    const found = await this.database.transaction(actor, async (tx) => {
      const result = await tx.query<{ display_name: string | null; email: string | null; roll_number: string | null }>(
        `SELECT u.display_name, u.email, s.roll_number
           FROM tickets.ticket_reporters r
           JOIN tickets.tickets t ON t.tenant_id = r.tenant_id AND t.id = r.ticket_id
           JOIN core.users u ON u.tenant_id = r.tenant_id AND u.id = r.user_id
           LEFT JOIN core.students s ON s.tenant_id = r.tenant_id AND s.user_id = r.user_id
          WHERE r.tenant_id = $1::uuid AND r.ticket_id = $2::uuid`,
        [actor.tenantId, grievanceId],
      );
      return result.rows[0];
    });
    if (found === undefined) return this.refuse(actor, grievanceId);
    return {
      ticketId: grievanceId,
      name: found.display_name ?? '',
      email: found.email ?? '',
      studentId: found.roll_number ?? '',
    };
  }

  /** `GET /grievances/l3`: open L3 Grievances with Working Days remaining and an overdue badge at 0 (8.4). */
  async listL3(actor: TicketActor): Promise<readonly L3GrievanceItem[]> {
    if (!isOmbudsperson(actor)) throw new GrievanceError(ErrorCode.INSUFFICIENT_PERMISSION);
    const nowMs = this.now();
    return this.database.transaction(actor, async (tx) => {
      const result = await tx.query<L3Row>(
        `SELECT t.id::text AS id, t.ref, t.anon_ref, t.title, t.status, t.band,
                (extract(epoch FROM COALESCE(e.escalated_at, c.l3_escalated_at)) * 1000)::bigint AS escalated_ms
           FROM tickets.tickets t
           LEFT JOIN LATERAL (
             SELECT x.escalated_at FROM sla.escalations x
              WHERE x.tenant_id = t.tenant_id AND x.ticket_id = t.id AND x.level = 3
              ORDER BY x.escalated_at DESC LIMIT 1
           ) e ON true
           LEFT JOIN sla.sla_clocks c ON c.tenant_id = t.tenant_id AND c.ticket_id = t.id
          WHERE t.tenant_id = $1::uuid AND t.escalation_level = 3 AND t.is_open
          ORDER BY escalated_ms ASC NULLS LAST, t.id`,
        [actor.tenantId],
      );
      const calendar = await this.loadCalendar(tx);
      return result.rows.map((row): L3GrievanceItem => {
        const escalatedAt = row.escalated_ms === null ? null : (Number(row.escalated_ms) as Instant);
        const usable = calendar !== undefined && escalatedAt !== null;
        const remaining = usable ? workingDaysRemaining(escalatedAt, nowMs, calendar) : null;
        return {
          id: row.id,
          ref: row.ref,
          anonRef: row.anon_ref,
          title: row.title,
          status: row.status,
          band: row.band,
          escalatedAt,
          reviewDueAt: usable ? l3ReviewDeadline(escalatedAt, calendar) : null,
          workingDaysRemaining: remaining,
          overdue: remaining === 0,
        };
      });
    });
  }

  /** `POST /grievances/{id}/decision`: stores the decision and rationale and notifies the Student (8.5). */
  async recordDecision(actor: TicketActor, grievanceId: string, input: DecisionInput): Promise<DecisionResult> {
    if (!UUID.test(grievanceId)) throw new GrievanceError(ErrorCode.ACCESS_DENIED);
    if (!isOmbudsperson(actor)) throw new GrievanceError(ErrorCode.INSUFFICIENT_PERMISSION);

    const fields: FieldError[] = [];
    const rationale = typeof input?.rationale === 'string' ? normaliseText(input.rationale, { trim: true }) : '';
    if (
      typeof input?.rationale !== 'string' ||
      textLength(rationale) < DECISION_RATIONALE_MIN_LENGTH ||
      textLength(rationale) > DECISION_RATIONALE_MAX_LENGTH
    ) {
      fields.push({ path: 'rationale', rule: 'length', min: DECISION_RATIONALE_MIN_LENGTH, max: DECISION_RATIONALE_MAX_LENGTH });
    }
    const decision = input?.decision === undefined ? DEFAULT_DECISION : input.decision;
    if (typeof decision !== 'string' || !DECISION_CODE.test(decision) || decision.length > DECISION_MAX_LENGTH) {
      fields.push({ path: 'decision', rule: 'format', max: DECISION_MAX_LENGTH });
    }
    if (fields.length > 0) invalid(fields);
    const nowMs = this.now();

    try {
      return await this.database.transaction(actor, async (tx) => {
        const ticket = await tx.query<{ escalation_level: number; is_open: boolean }>(
          `SELECT escalation_level, is_open FROM tickets.tickets WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
          [actor.tenantId, grievanceId],
        );
        const row = ticket.rows[0];
        if (row === undefined) throw new GrievanceError(ErrorCode.ACCESS_DENIED);
        if (row.escalation_level !== 3 || !row.is_open) throw new GrievanceError(ErrorCode.INVALID_TRANSITION);

        await tx.query(
          `INSERT INTO tickets.ombudsperson_decisions (tenant_id, ticket_id, decision, rationale, decided_by, at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, to_timestamp($6::double precision / 1000.0))`,
          [actor.tenantId, grievanceId, decision, rationale, actor.userId, nowMs],
        );
        await enqueueEvent(
          tx,
          {
            type: 'GrievanceDecisionRecorded',
            version: 1,
            tenantId: actor.tenantId,
            payload: { ticketId: grievanceId, decision },
          },
          () => nowMs,
        );
        await this.audit.record(tx, actor.tenantId, {
          actor: actor.userId,
          role: roleCode(actor),
          action: auditCode('grievance.decision_recorded'),
          target: `ticket:${grievanceId}`,
          outcome: 'success',
          details: { decision: auditCode(decision) },
          timestampMs: nowMs,
        });
        return { ticketId: grievanceId, decision, at: nowMs };
      });
    } catch (error) {
      if (isAuditFailure(error)) throw new GrievanceError(ErrorCode.AUDIT_UNAVAILABLE);
      throw error;
    }
  }

  // ---- helpers ----------------------------------------------------------------------------------------------

  /** Writes the refusal's audit entry in its own transaction, then refuses with `ACCESS_DENIED` (8.7). */
  private async refuse(actor: TicketActor, grievanceId: string): Promise<never> {
    const nowMs = this.now();
    try {
      await this.database.transaction(actor, async (tx) => {
        await this.audit.record(tx, actor.tenantId, {
          actor: actor.userId,
          role: roleCode(actor),
          action: auditCode('grievance.identity_access_denied'),
          target: `ticket:${grievanceId}`,
          outcome: 'failure',
          timestampMs: nowMs,
        });
      });
    } catch (error) {
      if (isAuditFailure(error)) throw new GrievanceError(ErrorCode.AUDIT_UNAVAILABLE);
      throw error;
    }
    throw new GrievanceError(ErrorCode.ACCESS_DENIED);
  }

  /** The reason is stored and audited only in redacted form. Redaction failure fails closed. */
  private async redactReason(actor: TicketActor, reason: string): Promise<RedactedText> {
    try {
      let result = await this.redactor.redact(reason, { tenantId: actor.tenantId });
      if (textLength(result.text) > REVEAL_REASON_MAX_LENGTH) {
        result = await this.redactor.redact(result.text.slice(0, REVEAL_REASON_MAX_LENGTH), { tenantId: actor.tenantId });
      }
      if (textLength(result.text) < REVEAL_REASON_MIN_LENGTH) {
        invalid([{ path: 'reason', rule: 'length', min: REVEAL_REASON_MIN_LENGTH, max: REVEAL_REASON_MAX_LENGTH }]);
      }
      return result.text;
    } catch (error) {
      if (error instanceof GrievanceError) throw error;
      throw new GrievanceError(ErrorCode.DEPENDENCY_DEGRADED);
    }
  }

  private async loadCalendar(tx: TicketSqlClient): Promise<WorkingCalendar | undefined> {
    const result = await tx.query<CalendarRow>(
      `SELECT time_zone, weekly,
              ARRAY(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(holidays) AS d ORDER BY d) AS holidays
         FROM core.working_calendars`,
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const weekly = {} as Record<IsoWeekday, readonly WorkingWindow[]>;
    for (const day of WEEKDAYS) weekly[day] = row.weekly[String(day)] ?? [];
    if (WEEKDAYS.every((day) => weekly[day].length === 0)) return undefined;
    return { timeZone: row.time_zone, weekly, holidays: row.holidays };
  }
}
