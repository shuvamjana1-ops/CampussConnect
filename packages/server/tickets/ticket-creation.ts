// Ticket creation: one idempotent transaction that stores the Ticket, its reporter link and first history entry,
// and writes `TicketCreated` plus the 30-second `triage_deadline` timer to the outbox (3.8, 3.9, 3.13, 5.6, 8.1, 23.7).

import { randomInt } from 'node:crypto';
import { normaliseText, textLength, type FieldError } from '@campusconnect/contracts';
import { TRIAGE_DEADLINE_MS } from '@campusconnect/domain/sla';
import { safetySignal } from '@campusconnect/domain/triage';
import type { Instant } from '@campusconnect/domain/types';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import { enqueueEvent, upsertTimer } from '../outbox';
import type { PriorityBand } from '../tenancy';
import {
  DESCRIPTION_MAX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  TICKET_TYPES,
  TITLE_MAX_LENGTH,
  TicketPermissionError,
  TicketValidationError,
  type CreateTicketInput,
  type CreateTicketResult,
  type IdempotencyKey,
  type TicketActor,
  type TicketDatabase,
  type TicketReceipt,
  type TicketSqlClient,
  type TicketType,
} from './tickets.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Crockford base32: no I, L, O or U, so a reference read aloud is not misheard. */
const ANON_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ANON_LENGTH = 8;
const ANON_PREFIX = 'CONF-';

export interface TicketCreationOptions {
  readonly database: TicketDatabase;
  readonly redactor: PiiRedactor;
  readonly now?: () => Instant;
}

interface TicketRow {
  id: string;
  ref: string;
  type: TicketType;
  anon_ref: string | null;
  status: string;
  band: PriorityBand;
  category_id: string;
  category_name: string;
  receipt_first_response_min: number | null;
  receipt_resolution_min: number | null;
  created_ms: string | number;
}

const TICKET_SELECT = `t.id::text AS id, t.ref, t.type, t.anon_ref, t.status, t.band, t.category_id::text AS category_id,
  c.name AS category_name, t.receipt_first_response_min, t.receipt_resolution_min,
  (extract(epoch FROM t.created_at) * 1000)::bigint AS created_ms`;

function toReceipt(row: TicketRow): TicketReceipt {
  const hasCommitments = row.receipt_first_response_min !== null && row.receipt_resolution_min !== null;
  return {
    ticketId: row.id,
    ref: row.ref,
    type: row.type,
    category: { id: row.category_id, name: row.category_name },
    band: row.band,
    status: row.status,
    ...(row.anon_ref === null ? {} : { anonRef: row.anon_ref }),
    commitments: hasCommitments
      ? { firstResponseMinutes: row.receipt_first_response_min as number, resolutionMinutes: row.receipt_resolution_min as number }
      : null,
    createdAt: Number(row.created_ms),
  };
}

function generateAnonRef(): string {
  let suffix = '';
  for (let i = 0; i < ANON_LENGTH; i += 1) suffix += ANON_ALPHABET[randomInt(ANON_ALPHABET.length)];
  return `${ANON_PREFIX}${suffix}`;
}

function validate(input: CreateTicketInput, key: IdempotencyKey): { title: string; description: string } {
  const fields: FieldError[] = [];
  if (typeof key !== 'string' || key.length < 1 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    fields.push({ path: 'Idempotency-Key', rule: 'length', min: 1, max: IDEMPOTENCY_KEY_MAX_LENGTH });
  }
  if (!TICKET_TYPES.includes(input.type)) {
    fields.push({ path: 'type', rule: 'enum', allowed: TICKET_TYPES });
  }
  const title = typeof input.title === 'string' ? normaliseText(input.title, { trim: true }) : '';
  if (typeof input.title !== 'string' || textLength(title) < 1 || textLength(title) > TITLE_MAX_LENGTH) {
    fields.push({ path: 'title', rule: 'length', min: 1, max: TITLE_MAX_LENGTH });
  }
  const description = typeof input.description === 'string' ? normaliseText(input.description, { trim: true }) : '';
  if (typeof input.description !== 'string' || textLength(description) < 1 || textLength(description) > DESCRIPTION_MAX_LENGTH) {
    fields.push({ path: 'description', rule: 'length', min: 1, max: DESCRIPTION_MAX_LENGTH });
  }
  if (typeof input.categoryId !== 'string' || !UUID.test(input.categoryId)) {
    fields.push({ path: 'categoryId', rule: 'format', expected: 'uuid' });
  }
  if (typeof input.confidential !== 'boolean') {
    fields.push({ path: 'confidential', rule: 'type', expected: 'boolean' });
  } else if (input.confidential && input.type !== 'complaint') {
    // Only Grievances can be confidential (3.8).
    fields.push({ path: 'confidential', rule: 'invalid', expected: 'false unless type is complaint' });
  }
  if (fields.length > 0) throw new TicketValidationError(fields);
  return { title, description };
}

export class TicketCreationService {
  private readonly database: TicketDatabase;
  private readonly redactor: PiiRedactor;
  private readonly now: () => Instant;

  constructor(options: TicketCreationOptions) {
    this.database = options.database;
    this.redactor = options.redactor;
    this.now = options.now ?? ((): Instant => Date.now() as Instant);
  }

  /**
   * Creates the Ticket, or returns the receipt of the one this `Idempotency-Key` already created. `201` for a new
   * Ticket, `200` for an existing one; n submissions with the same key leave exactly one Ticket (3.9).
   */
  async create(actor: TicketActor, key: IdempotencyKey, input: CreateTicketInput): Promise<CreateTicketResult> {
    if (!actor.roles.includes('student')) throw new TicketPermissionError();
    const { title, description } = validate(input, key);

    // Redaction runs before the transaction so a slow redactor does not hold a connection. A failure leaves the
    // copy null: the text is then never sent to an AI provider (5.3), but the submission still succeeds.
    const redacted = await this.redact(actor, description);
    const signal = safetySignal(`${title}\n${description}`) !== null;

    return this.database.transaction(actor, async (tx) => {
      const existing = await this.loadByKey(tx, actor, key);
      if (existing !== undefined) return { status: 200, receipt: existing };

      const category = await this.loadCategory(tx, input.categoryId);
      if (category === undefined) {
        throw new TicketValidationError([{ path: 'categoryId', rule: 'tenant_member' }]);
      }

      // Safety signals set P0 at once so a safety case never waits for AI (5.6); otherwise the category default.
      const band: PriorityBand = signal ? 'P0' : category.defaultBand;
      const sla = await this.loadCommitments(tx, band, category.id);
      const nowMs = this.now();
      const ref = await this.nextRef(tx, actor, nowMs);
      const confidential = input.confidential;
      // 32^8 values; the `(tenant_id, anon_ref)` unique constraint guarantees uniqueness per Tenant. A Student's
      // session cannot see other Students' rows, so a pre-check would be blind and is deliberately omitted.
      const anonRef = confidential ? generateAnonRef() : null;
      const flags = sla === null ? { slaUnconfigured: true } : {};

      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO tickets.tickets
           (tenant_id, ref, type, confidential, anon_ref, idempotency_key, title, description, description_redacted,
            category_id, band, flags, reporter_id, receipt_first_response_min, receipt_resolution_min,
            created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12::jsonb, $13::uuid, $14, $15,
                 to_timestamp($16::double precision / 1000.0), to_timestamp($16::double precision / 1000.0))
         ON CONFLICT (tenant_id, reporter_id, idempotency_key) DO NOTHING
         RETURNING id::text AS id`,
        [
          actor.tenantId,
          ref,
          input.type,
          confidential,
          anonRef,
          key,
          title,
          description,
          redacted,
          category.id,
          band,
          JSON.stringify(flags),
          actor.userId,
          sla?.firstResponseMinutes ?? null,
          sla?.resolutionMinutes ?? null,
          nowMs,
        ],
      );
      const ticketId = inserted.rows[0]?.id;
      if (ticketId === undefined) {
        // A concurrent submission with the same key committed first: return its receipt.
        const winner = await this.loadByKey(tx, actor, key);
        if (winner === undefined) throw new Error('Ticket insert conflicted but no Ticket exists for the key.');
        return { status: 200, receipt: winner };
      }

      await tx.query(
        `INSERT INTO tickets.ticket_reporters (tenant_id, ticket_id, user_id, confidential)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
        [actor.tenantId, ticketId, actor.userId, confidential],
      );
      await tx.query(
        `INSERT INTO tickets.ticket_history (tenant_id, ticket_id, actor_id, at, from_status, to_status, reason)
         VALUES ($1::uuid, $2::uuid, $3::uuid, to_timestamp($4::double precision / 1000.0), NULL, 'New', 'Submitted')`,
        [actor.tenantId, ticketId, actor.userId, nowMs],
      );
      await enqueueEvent(
        tx,
        {
          type: 'TicketCreated',
          version: 1,
          tenantId: actor.tenantId,
          payload: { ticketId, studentId: actor.userId },
        },
        () => nowMs,
      );
      await upsertTimer(tx, { tenantId: actor.tenantId, ticketId, kind: 'triage_deadline' }, nowMs + TRIAGE_DEADLINE_MS);

      const row = await this.loadById(tx, ticketId);
      if (row === undefined) throw new Error('Ticket was inserted but cannot be read back.');
      return { status: 201, receipt: row };
    });
  }

  private async redact(actor: TicketActor, description: string): Promise<string | null> {
    try {
      const result = await this.redactor.redact(description, { tenantId: actor.tenantId });
      return result.text;
    } catch {
      return null;
    }
  }

  private async loadByKey(tx: TicketSqlClient, actor: TicketActor, key: string): Promise<TicketReceipt | undefined> {
    const result = await tx.query<TicketRow>(
      `SELECT ${TICKET_SELECT}
         FROM tickets.tickets t
         JOIN core.categories c ON c.tenant_id = t.tenant_id AND c.id = t.category_id
        WHERE t.tenant_id = $1::uuid AND t.reporter_id = $2::uuid AND t.idempotency_key = $3`,
      [actor.tenantId, actor.userId, key],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toReceipt(row);
  }

  private async loadById(tx: TicketSqlClient, ticketId: string): Promise<TicketReceipt | undefined> {
    const result = await tx.query<TicketRow>(
      `SELECT ${TICKET_SELECT}
         FROM tickets.tickets t
         JOIN core.categories c ON c.tenant_id = t.tenant_id AND c.id = t.category_id
        WHERE t.id = $1::uuid`,
      [ticketId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toReceipt(row);
  }

  private async loadCategory(
    tx: TicketSqlClient,
    categoryId: string,
  ): Promise<{ id: string; defaultBand: PriorityBand } | undefined> {
    const result = await tx.query<{ id: string; default_band: PriorityBand }>(
      `SELECT id::text AS id, default_band FROM core.categories WHERE id = $1::uuid AND active`,
      [categoryId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : { id: row.id, defaultBand: row.default_band };
  }

  /** Category-specific SLA row first, then the band default. Null when neither exists. */
  private async loadCommitments(
    tx: TicketSqlClient,
    band: PriorityBand,
    categoryId: string,
  ): Promise<{ firstResponseMinutes: number; resolutionMinutes: number } | null> {
    const result = await tx.query<{ first_response_min: number; resolution_min: number }>(
      `SELECT first_response_min, resolution_min
         FROM core.sla_policies
        WHERE band = $1 AND (category_id = $2::uuid OR category_id IS NULL)
        ORDER BY (category_id IS NULL)
        LIMIT 1`,
      [band, categoryId],
    );
    const row = result.rows[0];
    return row === undefined ? null : { firstResponseMinutes: row.first_response_min, resolutionMinutes: row.resolution_min };
  }

  /** `TKT-<year>-<6 digits>`, unique per Tenant and year through the counter row lock. */
  private async nextRef(tx: TicketSqlClient, actor: TicketActor, nowMs: number): Promise<string> {
    const year = new Date(nowMs).getUTCFullYear();
    const result = await tx.query<{ last_value: number }>(
      `INSERT INTO tickets.ref_counters (tenant_id, year, last_value) VALUES ($1::uuid, $2, 1)
       ON CONFLICT (tenant_id, year) DO UPDATE SET last_value = tickets.ref_counters.last_value + 1
       RETURNING last_value`,
      [actor.tenantId, year],
    );
    const value = result.rows[0]?.last_value;
    if (value === undefined) throw new Error('Reference counter returned no row.');
    return `TKT-${year}-${String(value).padStart(6, '0')}`;
  }

}
