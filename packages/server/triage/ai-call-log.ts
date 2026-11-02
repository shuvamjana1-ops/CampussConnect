// Postgres sink for the AI adapter's call log (23.4). Stores the input hash, never the text.

import type { AiCallLog, AiCallRecord } from '@campusconnect/ai-adapter';
import { useTenant, type OutboxDatabase } from '../outbox/outbox.types';
import { currentAiTenant } from './triage.types';

export class PostgresAiCallLog implements AiCallLog {
  constructor(
    private readonly db: OutboxDatabase,
    /** Defaults to the Tenant set by `runWithAiTenant`. */
    private readonly tenantOf: () => string | undefined = currentAiTenant,
  ) {}

  async recordCall(call: AiCallRecord): Promise<void> {
    const tenantId = this.tenantOf();
    if (tenantId === undefined) throw new Error('AI call recorded outside a Tenant context.');
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `INSERT INTO triage.ai_calls
           (tenant_id, purpose, provider, model_id, model_version, input_hash, output, confidences, latency_ms, status,
            error_message)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::numeric[], $9, $10, $11)`,
        [
          tenantId,
          call.purpose,
          call.provider,
          call.modelId,
          call.modelVersion ?? null,
          call.inputHash,
          JSON.stringify(call.output ?? null),
          call.confidences.map((c) => Math.min(1, Math.max(0, c))),
          Math.max(0, Math.round(call.latencyMs)),
          call.status.slice(0, 32),
          call.errorMessage?.slice(0, 500) ?? null,
        ],
      );
    });
  }
}
