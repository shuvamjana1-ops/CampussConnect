// `GET /tickets/{id}/summary`: an AI summary of the redacted thread, shown with the "AI-suggested" label
// (task 18.6; requirements 7.12, 7.13, 5.15). The call has a 3-second deadline and the result is cached by Ticket
// version. A timeout, error or missing redaction returns `unavailable`; the Ticket still opens (7.13).

import { ErrorCode } from '@campusconnect/contracts';
import type { AiAdapter } from '@campusconnect/ai-adapter';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import type { DependencyHealth } from '../health';
import type { TicketActor, TicketDatabase } from '../tickets';
import { runWithAiTenant, withTimeout } from '../triage';
import { SUMMARY_MAX_TOKENS, SUMMARY_TIMEOUT_MS, WorkbenchError, type SummaryResult } from './workbench.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_THREAD_CHARS = 30_000;
const MAX_MESSAGES = 50;
const SUMMARY_MAX_CHARS = 4_000;
const SYSTEM_PROMPT =
  'Summarise this support Ticket thread for a university staff member in at most five short sentences. ' +
  'State the issue, what has been done and what is pending. Do not add facts that are not in the thread.';

const UNAVAILABLE: SummaryResult = { unavailable: true };

export interface SummaryServiceOptions {
  readonly database: TicketDatabase;
  readonly redactor: PiiRedactor;
  readonly ai: AiAdapter;
  readonly health: DependencyHealth;
  readonly timeoutMs?: number;
}

interface ThreadRow {
  version: number;
  title: string;
  description: string;
  cached_summary: string | null;
  cached_version: number | null;
  cached_count: number | null;
}

export class SummaryService {
  private readonly timeoutMs: number;

  constructor(private readonly o: SummaryServiceOptions) {
    this.timeoutMs = o.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  }

  async summarise(actor: TicketActor, ticketId: string): Promise<SummaryResult> {
    if (!actor.roles.includes('handler') && !actor.roles.includes('dept_head')) {
      throw new WorkbenchError(ErrorCode.INSUFFICIENT_PERMISSION);
    }
    if (!UUID.test(ticketId)) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);

    let thread: { version: number; count: number; raw: string; cached: string | null };
    try {
      const loaded = await this.o.database.transaction(actor, async (tx) => {
        const head = await tx.query<ThreadRow>(
          `SELECT t.version, t.title, t.description, s.summary AS cached_summary,
                  s.ticket_version AS cached_version, s.message_count AS cached_count
           FROM tickets.tickets t
           LEFT JOIN workbench.ticket_summaries s ON s.tenant_id = t.tenant_id AND s.ticket_id = t.id
           WHERE t.tenant_id = $1::uuid AND t.id = $2::uuid`,
          [actor.tenantId, ticketId],
        );
        const row = head.rows[0];
        if (row === undefined) return undefined;
        const messages = await tx.query<{ visibility: string; body: string }>(
          `SELECT visibility, body FROM (
             SELECT visibility, body, created_at FROM tickets.ticket_messages
             WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
             ORDER BY created_at DESC LIMIT ${MAX_MESSAGES}
           ) m ORDER BY created_at`,
          [actor.tenantId, ticketId],
        );
        const count = await tx.query<{ n: string | number }>(
          `SELECT count(*) AS n FROM tickets.ticket_messages WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [actor.tenantId, ticketId],
        );
        const total = Number(count.rows[0]?.n ?? 0);
        const raw = [
          `Title: ${row.title}`,
          `Description: ${row.description}`,
          ...messages.rows.map((m) => `${m.visibility === 'internal' ? 'Staff note' : 'Message'}: ${m.body}`),
        ]
          .join('\n')
          .slice(0, MAX_THREAD_CHARS);
        const fresh = row.cached_version === row.version && row.cached_count === total;
        return { version: row.version, count: total, raw, cached: fresh ? row.cached_summary : null };
      });
      if (loaded === undefined) throw new WorkbenchError(ErrorCode.ACCESS_DENIED);
      thread = loaded;
    } catch (error) {
      if (error instanceof WorkbenchError) throw error;
      return UNAVAILABLE;
    }

    if (thread.cached !== null) return { summary: thread.cached, label: 'AI-suggested' };

    // If redaction fails nothing is sent to the provider (5.3).
    let redacted;
    try {
      redacted = (await this.o.redactor.redact(thread.raw, { tenantId: actor.tenantId })).text;
    } catch {
      return UNAVAILABLE;
    }

    let summary: string | undefined;
    try {
      const response = await withTimeout(
        runWithAiTenant(actor.tenantId, () =>
          this.o.ai.generate(
            {
              purpose: 'summary',
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: redacted }],
              maxTokens: SUMMARY_MAX_TOKENS,
            },
            { timeoutMs: this.timeoutMs },
          ),
        ),
        this.timeoutMs,
      );
      this.o.health.record('ai', response.type === 'success' ? 'success' : 'failure');
      if (response.type === 'success') {
        const text = response.data.text.trim().slice(0, SUMMARY_MAX_CHARS);
        if (text.length > 0) summary = text;
      }
    } catch {
      this.o.health.record('ai', 'failure');
    }
    if (summary === undefined) return UNAVAILABLE;

    try {
      await this.o.database.transaction(actor, async (tx) => {
        await tx.query(
          `INSERT INTO workbench.ticket_summaries (tenant_id, ticket_id, ticket_version, message_count, summary)
           VALUES ($1::uuid, $2::uuid, $3::int, $4::int, $5)
           ON CONFLICT (tenant_id, ticket_id) DO UPDATE
             SET ticket_version = EXCLUDED.ticket_version, message_count = EXCLUDED.message_count,
                 summary = EXCLUDED.summary, created_at = now()`,
          [actor.tenantId, ticketId, thread.version, thread.count, summary],
        );
      });
    } catch {
      // A cache write failure only costs a provider call next time.
    }
    return { summary, label: 'AI-suggested' };
  }
}
