// `POST /triage/suggest`: a category suggestion while the Student types (3.5, 3.6, 5.1, 5.11, 23.5).

import { createHash } from 'node:crypto';
import type { AiAdapter } from '@campusconnect/ai-adapter';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import type { DependencyHealth } from '../health';
import { useTenant, type OutboxDatabase } from '../outbox/outbox.types';
import {
  SUGGEST_AI_TIMEOUT_MS,
  SUGGEST_CACHE_TTL_SECONDS,
  runWithAiTenant,
  withTimeout,
  type TriageCache,
} from './triage.types';

export const MAX_SUGGEST_TEXT_LENGTH = 5_000;

export type SuggestResult =
  | { readonly categoryId: string; readonly confidencePercent: number }
  | { readonly unavailable: true };

export interface SuggestActor {
  readonly tenantId: string;
}

export interface SuggestServiceOptions {
  readonly db: OutboxDatabase;
  readonly redactor: PiiRedactor;
  readonly ai: AiAdapter;
  readonly health: DependencyHealth;
  readonly cache: TriageCache;
}

export class SuggestValidationError extends Error {
  constructor() {
    super('VALIDATION_FAILED');
    this.name = 'SuggestValidationError';
  }
}

const UNAVAILABLE: SuggestResult = { unavailable: true };

export class SuggestService {
  constructor(private readonly o: SuggestServiceOptions) {}

  async suggest(actor: SuggestActor, text: string): Promise<SuggestResult> {
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_SUGGEST_TEXT_LENGTH) {
      throw new SuggestValidationError();
    }

    // Redaction is synchronous with the request. If it fails, nothing is sent to the provider (5.3).
    let redacted;
    try {
      redacted = (await this.o.redactor.redact(text, { tenantId: actor.tenantId })).text;
    } catch {
      return UNAVAILABLE;
    }

    const key = `triage:suggest:${actor.tenantId}:${createHash('sha256').update(String(redacted)).digest('hex')}`;
    try {
      const hit = await this.o.cache.get(key);
      if (hit !== null) return JSON.parse(hit) as SuggestResult;
    } catch {
      // A cache outage only costs a provider call.
    }

    const categories = await this.o.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      return (
        await tx.query<{ id: string; name: string }>(
          `SELECT id::text, name FROM core.categories WHERE tenant_id = $1::uuid AND active ORDER BY name`,
          [actor.tenantId],
        )
      ).rows;
    });
    if (categories.length === 0) return UNAVAILABLE;

    let result: SuggestResult = UNAVAILABLE;
    try {
      const response = await withTimeout(
        runWithAiTenant(actor.tenantId, () =>
          this.o.ai.classify(
            { purpose: 'suggest', text: redacted, labels: categories.map((c) => ({ id: c.id, description: c.name })) },
            { timeoutMs: SUGGEST_AI_TIMEOUT_MS },
          ),
        ),
        SUGGEST_AI_TIMEOUT_MS,
      );
      this.o.health.record('ai', response.type === 'success' ? 'success' : 'failure');
      if (response.type === 'success') {
        const top = [...response.data.scores].sort((a, b) => b.confidence - a.confidence)[0];
        if (top !== undefined && categories.some((c) => c.id === top.id) && Number.isFinite(top.confidence)) {
          const clamped = Math.min(1, Math.max(0, top.confidence));
          result = { categoryId: top.id, confidencePercent: Math.round(clamped * 100) };
        }
      }
    } catch {
      this.o.health.record('ai', 'failure');
    }

    if ('categoryId' in result) {
      try {
        await this.o.cache.set(key, JSON.stringify(result), SUGGEST_CACHE_TTL_SECONDS);
      } catch {
        // Ignored: see above.
      }
    }
    return result;
  }
}
