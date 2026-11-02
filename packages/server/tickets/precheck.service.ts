// Submission prechecks (3.10, 3.11, 3.12). Both checks run locally inside a 5-second budget:
// `pg_trgm` similarity against the Student's own open Tickets, and the profanity word lists.
// Linking appends the text as a Student message on the existing Ticket and creates no Ticket (G11).

import { ErrorCode, type FieldError } from '@campusconnect/contracts';
import { selectDuplicates } from '@campusconnect/domain/tickets';
import type { TicketStatus } from '@campusconnect/domain/tickets';
import type { TenantId, UserId } from '@campusconnect/domain/types';
import type { AuditSqlClient } from '../audit';
import { findProfanity } from './profanity';

export const PRECHECK_BUDGET_MS = 5_000;
export const MIN_TEXT_LENGTH = 1;
export const MAX_TEXT_LENGTH = 5_000;
const DEFAULT_DUPLICATE_THRESHOLD = 0.6;
const MAX_DUPLICATES = 5;

export interface PrecheckActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

/** Opens a transaction with the actor's Tenant set for row-level security (for example through `withTenant`). */
export interface PrecheckDatabase {
  transaction<T>(actor: PrecheckActor, fn: (tx: AuditSqlClient) => Promise<T>): Promise<T>;
}

export interface DuplicateCandidate {
  readonly ticketId: string;
  readonly ref: string;
  readonly title: string;
  readonly status: TicketStatus;
  /** 0 to 1. */
  readonly similarity: number;
}

export interface PrecheckResult {
  readonly duplicates: readonly DuplicateCandidate[];
  /** False when the duplicate check ran out of budget; the Student may continue. */
  readonly duplicatesChecked: boolean;
  readonly profanity: { readonly flagged: boolean };
}

export interface LinkResult {
  readonly ticketId: string;
  readonly messageId: string;
}

export class PrecheckValidationError extends Error {
  constructor(readonly fields: readonly FieldError[]) {
    super('VALIDATION_FAILED');
    this.name = 'PrecheckValidationError';
  }
}

/** The Ticket does not exist, is not the Student's own, or is Closed. Surfaced as not found. */
export class PrecheckTicketNotFoundError extends Error {
  constructor() {
    super('TICKET_NOT_FOUND');
    this.name = 'PrecheckTicketNotFoundError';
  }
}

/** Thrown by `POST /tickets` (via `assertProfanityConfirmed`) when flagged text lacks confirmation: 422. */
export class ProfanityConfirmationRequiredError extends Error {
  readonly code = ErrorCode.PROFANITY_CONFIRMATION_REQUIRED;
  constructor() {
    super(ErrorCode.PROFANITY_CONFIRMATION_REQUIRED);
    this.name = 'ProfanityConfirmationRequiredError';
  }
}

/** Throws `ProfanityConfirmationRequiredError` unless the text is clean or `profanityConfirmed` is true (3.12). */
export function assertProfanityConfirmed(texts: readonly string[], profanityConfirmed: boolean | undefined): void {
  if (profanityConfirmed === true) return;
  if (texts.some((text) => findProfanity(text).length > 0)) throw new ProfanityConfirmationRequiredError();
}

interface CandidateRow {
  id: string;
  ref: string;
  title: string;
  status: TicketStatus;
  reporter_id: string;
  score: string | number;
}

export interface PrecheckServiceOptions {
  readonly database: PrecheckDatabase;
  readonly budgetMs?: number;
}

export class PrecheckService {
  private readonly database: PrecheckDatabase;
  private readonly budgetMs: number;

  constructor(options: PrecheckServiceOptions) {
    this.database = options.database;
    this.budgetMs = options.budgetMs ?? PRECHECK_BUDGET_MS;
  }

  /** `POST /tickets/precheck`: duplicates and profanity for the text the Student is about to submit. */
  async precheck(actor: PrecheckActor, input: unknown): Promise<PrecheckResult> {
    const { text } = parseText(input);
    const profanity = { flagged: findProfanity(text).length > 0 };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.budgetMs);
    });
    try {
      const duplicates = await Promise.race([this.findDuplicates(actor, text), timeout]);
      return { duplicates: duplicates ?? [], duplicatesChecked: duplicates !== null, profanity };
    } catch {
      // The duplicate check is advisory: a failure must not block submission.
      return { duplicates: [], duplicatesChecked: false, profanity };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** The link option: appends the text as a Student message on the existing Ticket. Creates no Ticket (G11). */
  async link(actor: PrecheckActor, ticketId: string, input: unknown): Promise<LinkResult> {
    const { text } = parseText(input);
    if (!UUID.test(ticketId)) throw new PrecheckTicketNotFoundError();
    return this.database.transaction(actor, async (tx) => {
      const ticket = await tx.query<{ id: string }>(
        `SELECT id::text AS id FROM tickets.tickets
         WHERE id = $1::uuid AND reporter_id = $2::uuid AND is_open FOR UPDATE`,
        [ticketId, actor.userId],
      );
      if (ticket.rows.length === 0) throw new PrecheckTicketNotFoundError();
      const message = await tx.query<{ id: string }>(
        `INSERT INTO tickets.ticket_messages (tenant_id, ticket_id, author_id, visibility, body)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'public', $4) RETURNING id::text AS id`,
        [actor.tenantId, ticketId, actor.userId, text],
      );
      return { ticketId, messageId: message.rows[0]!.id };
    });
  }

  private findDuplicates(actor: PrecheckActor, text: string): Promise<DuplicateCandidate[]> {
    return this.database.transaction(actor, async (tx) => {
      await tx.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(this.budgetMs))}`);
      const threshold = await this.duplicateThreshold(tx, actor);
      const rows = (
        await tx.query<CandidateRow>(
          `SELECT id::text AS id, ref, title, status, reporter_id::text AS reporter_id,
                  similarity(lower(title || ' ' || description), lower($2)) AS score
           FROM tickets.tickets
           WHERE reporter_id = $1::uuid AND is_open
           ORDER BY score DESC LIMIT 50`,
          [actor.userId, text],
        )
      ).rows;
      const scores = new Map(rows.map((row) => [row.id, Number(row.score)]));
      return selectDuplicates(
        actor.userId,
        rows.map((row) => ({ ...row, reporterId: row.reporter_id as UserId })),
        (ticket) => scores.get(ticket.id) ?? 0,
        threshold,
      )
        .slice(0, MAX_DUPLICATES)
        .map((ticket) => ({
          ticketId: ticket.id,
          ref: ticket.ref,
          title: ticket.title,
          status: ticket.status,
          similarity: scores.get(ticket.id) ?? 0,
        }));
    });
  }

  private async duplicateThreshold(tx: AuditSqlClient, actor: PrecheckActor): Promise<number> {
    const result = await tx.query<{ duplicate_threshold: string | number }>(
      'SELECT duplicate_threshold FROM core.tenant_config WHERE tenant_id = $1::uuid',
      [actor.tenantId],
    );
    const value = result.rows[0]?.duplicate_threshold;
    return value === undefined ? DEFAULT_DUPLICATE_THRESHOLD : Number(value);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseText(input: unknown): { text: string } {
  const text = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['text'] : undefined;
  if (typeof text !== 'string' || text.trim().length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
    throw new PrecheckValidationError([{ path: 'text', rule: 'length', min: MIN_TEXT_LENGTH, max: MAX_TEXT_LENGTH }]);
  }
  return { text };
}
