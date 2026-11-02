// Opportunity publication, embedding and expiry (requirements 10.10 to 10.14).

import type { AiAdapter } from '@campusconnect/ai-adapter';
import { opportunitySchema, validate } from '@campusconnect/contracts';
import { authorize } from '@campusconnect/domain/rbac';
import { EMBEDDING_REGENERATION_POLICY, retryDelayMs } from '@campusconnect/domain/retry';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import { enqueueEvent, useTenant, type OutboxDatabase } from '../outbox';
import {
  OPPORTUNITY_EMBED_TIMEOUT_MS,
  OPPORTUNITY_EXPIRY_CADENCE_MS,
  OpportunityPermissionError,
  OpportunityValidationError,
  type OpportunityActor,
  type OpportunityRecord,
} from './opportunity.types';

export interface OpportunityServiceOptions {
  readonly database: OutboxDatabase;
  readonly redactor: PiiRedactor;
  readonly ai: AiAdapter;
  readonly now?: () => number;
}

export class OpportunityService {
  private readonly db: OutboxDatabase;
  private readonly now: () => number;

  constructor(private readonly options: OpportunityServiceOptions) {
    this.db = options.database;
    this.now = options.now ?? Date.now;
  }

  /**
   * `POST /opportunities`. Requires the `opportunity.publish` grant (10.12), validates against the catalogue and
   * lists every invalid field (10.11), then stores the Opportunity and a `OpportunityPublished` event atomically.
   * Nothing is stored on rejection. Embedding runs asynchronously from the event.
   */
  async publish(actor: OpportunityActor, body: unknown): Promise<OpportunityRecord> {
    const { principal } = actor;
    const decision = authorize(principal, { kind: 'opportunity', tenantId: principal.tenantId }, 'opportunity.publish');
    if (decision.effect !== 'allow') throw new OpportunityPermissionError();

    const result = validate(opportunitySchema({ now: new Date(this.now()) }), body);
    if (!result.ok) throw new OpportunityValidationError(result.errors);
    const o = result.value;

    return this.db.transaction(async (tx) => {
      await useTenant(tx, principal.tenantId);
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO opps.opportunities
           (tenant_id, title, description, eligibility_rules, required_documents, deadline, apply_link,
            apply_instructions, status, created_by, embedding_next_at)
         VALUES (app.tenant(), $1, $2, $3::jsonb, $4::jsonb, $5::timestamptz, $6, $7, 'published', $8::uuid, now())
         RETURNING id::text AS id`,
        [
          o.title,
          o.description,
          JSON.stringify(o.eligibilityRules),
          JSON.stringify(o.requiredDocuments),
          o.deadline,
          o.applyLink ?? null,
          o.applyInstructions ?? null,
          principal.userId,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) throw new Error('Opportunity insert returned no row.');
      await enqueueEvent(
        tx,
        { type: 'OpportunityPublished', version: 1, tenantId: principal.tenantId, payload: { opportunityId: id } },
        this.now,
      );
      return { id, title: o.title, deadline: Date.parse(o.deadline), status: 'published' as const };
    });
  }

  /**
   * Embeds one Opportunity. The text goes through the redactor first and only RedactedText reaches the adapter
   * (10.14). On failure the previous vector is kept, the Opportunity is flagged stale and a retry is scheduled under
   * EMBEDDING_REGENERATION_POLICY. Returns true when a vector was stored.
   */
  async embedOpportunity(tenantId: string, opportunityId: string): Promise<boolean> {
    const row = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{ title: string; description: string; required_documents: string[]; status: string }>(
        `SELECT title, description, required_documents, status FROM opps.opportunities
          WHERE tenant_id = app.tenant() AND id = $1::uuid`,
        [opportunityId],
      );
      return r.rows[0];
    });
    if (row === undefined || row.status !== 'published') return false;

    const text = [row.title, row.description, ...row.required_documents].join('\n');
    let vector: readonly number[] | undefined;
    try {
      const redacted = (await this.options.redactor.redact(text, { tenantId })).text;
      const result = await this.options.ai.embed(
        { purpose: 'embed', texts: [redacted] },
        { timeoutMs: OPPORTUNITY_EMBED_TIMEOUT_MS },
      );
      if (result.type === 'success') vector = result.data.vectors[0];
    } catch {
      vector = undefined;
    }

    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      if (vector !== undefined) {
        await tx.query(
          `UPDATE opps.opportunities
              SET embedding = $2::vector, embedding_stale = false, embedding_attempts = 0, embedding_next_at = NULL,
                  updated_at = now()
            WHERE tenant_id = app.tenant() AND id = $1::uuid`,
          [opportunityId, `[${vector.join(',')}]`],
        );
        return;
      }
      const policy = EMBEDDING_REGENERATION_POLICY;
      await tx.query(
        `UPDATE opps.opportunities
            SET embedding_stale = true, embedding_attempts = embedding_attempts + 1, updated_at = now(),
                embedding_next_at = CASE WHEN embedding_attempts + 1 <= $2::int
                                         THEN now() + ($3::bigint * interval '1 millisecond') END
          WHERE tenant_id = app.tenant() AND id = $1::uuid`,
        [opportunityId, policy.maxRetries, retryDelayMs(policy, 0)],
      );
    });
    return vector !== undefined;
  }

  /** Re-embeds Opportunities whose embedding is missing or whose retry is due. Returns the number embedded. */
  async runEmbeddingRetries(tenantId: string, limit = 50): Promise<number> {
    const ids = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{ id: string }>(
        `SELECT id::text AS id FROM opps.opportunities
          WHERE tenant_id = app.tenant() AND status = 'published' AND embedding_next_at <= now()
          ORDER BY embedding_next_at LIMIT $1`,
        [limit],
      );
      return r.rows.map((x) => x.id);
    });
    let embedded = 0;
    for (const id of ids) if (await this.embedOpportunity(tenantId, id)) embedded += 1;
    return embedded;
  }

  /**
   * Marks published Opportunities past their deadline as Expired and emits `OpportunityExpired` for each (10.13).
   * Expired Opportunities leave recommendations because matching reads only `published`. Idempotent. Returns the
   * ids expired.
   */
  async expireDue(tenantId: string, limit = 500): Promise<readonly string[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{ id: string }>(
        `UPDATE opps.opportunities
            SET status = 'expired', expired_at = now(), embedding_next_at = NULL, updated_at = now()
          WHERE tenant_id = app.tenant()
            AND id IN (SELECT id FROM opps.opportunities
                        WHERE tenant_id = app.tenant() AND status = 'published' AND deadline <= now()
                        ORDER BY deadline LIMIT $1)
          RETURNING id::text AS id`,
        [limit],
      );
      for (const { id } of r.rows) {
        await enqueueEvent(
          tx,
          { type: 'OpportunityExpired', version: 1, tenantId, payload: { opportunityId: id } },
          this.now,
        );
      }
      return r.rows.map((x) => x.id);
    });
  }
}

export interface OpportunityExpirySweeperOptions {
  readonly service: OpportunityService;
  /** Tenants to sweep on each pass. */
  readonly tenantIds: () => Promise<readonly string[]>;
  readonly cadenceMs?: number;
  readonly onError?: (error: unknown) => void;
}

/** Periodically expires Opportunities and retries stale embeddings so expiry lands within 5 minutes (10.13). */
export class OpportunityExpirySweeper {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: OpportunityExpirySweeperOptions) {}

  start(): void {
    if (this.timer !== undefined) return;
    const cadence = this.options.cadenceMs ?? OPPORTUNITY_EXPIRY_CADENCE_MS;
    this.timer = setInterval(() => void this.runOnce(), cadence);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One pass over every Tenant. A failure for one Tenant does not stop the others. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const tenantId of await this.options.tenantIds()) {
        try {
          await this.options.service.expireDue(tenantId);
          await this.options.service.runEmbeddingRetries(tenantId);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
  }
}
