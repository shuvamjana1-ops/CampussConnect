// Profile embeddings (requirements 10.7, 10.8, 10.14, 11.10) and the consent-gated income band (10.5, 10.6, 19.2).

import type { AiAdapter } from '@campusconnect/ai-adapter';
import { EMBEDDING_REGENERATION_POLICY, retryDelayMs } from '@campusconnect/domain/retry';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import type { ConsentService } from '../privacy/consent.service';
import { INCOME_BAND_PURPOSE, type ProfileDatabase, type ProfileSqlClient } from './profile.types';
import type { ProfileService } from './profile.service';

/**
 * Fields that may appear in embedding text. Income band, social category and gender are never ranking inputs (11.10),
 * and identifiers such as the roll number and hostel carry no matching signal.
 */
export const EMBEDDING_FIELD_ALLOWLIST: readonly string[] = [
  'program',
  'department',
  'year',
  'skills',
  'interests',
  'achievements',
  'preferredLocations',
  'cgpa',
  'graduationYear',
];

export const PROFILE_EMBEDDING_DIMENSIONS = 1024;
const EMBED_TIMEOUT_MS = 10_000;

export interface ProfileEmbeddingServiceOptions {
  readonly database: ProfileDatabase;
  readonly ai: AiAdapter;
  readonly redactor: PiiRedactor;
  readonly now?: () => number;
}

interface DueRow {
  user_id: string;
  fields: Record<string, { value: unknown }>;
  updated_at: Date | string;
  embedding_attempts: number;
}

/** Plain text of the allowlisted fields only. Empty when the profile holds none of them. */
export function buildProfileText(fields: Readonly<Record<string, { readonly value: unknown }>>): string {
  const lines: string[] = [];
  for (const name of EMBEDDING_FIELD_ALLOWLIST) {
    const value = fields[name]?.value;
    if (value === undefined || value === null) continue;
    const text = Array.isArray(value) ? value.map(String).join(', ') : String(value);
    if (text.trim().length > 0) lines.push(`${name}: ${text}`);
  }
  return lines.join('\n');
}

export class ProfileEmbeddingService {
  private readonly db: ProfileDatabase;

  constructor(private readonly options: ProfileEmbeddingServiceOptions) {
    this.db = options.database;
  }

  /**
   * `embed` worker. Run at least every minute so a change is embedded well inside 5 minutes (10.7). Picks profiles
   * changed since their last embedding and profiles whose retry is due. Returns the number of vectors stored.
   */
  async runEmbeddings(tenantId: string, limit = 50): Promise<number> {
    const due = await this.db.transaction({ tenantId }, async (tx) => {
      const r = await tx.query<DueRow>(
        `SELECT user_id::text AS user_id, fields, updated_at, embedding_attempts
           FROM opps.student_profiles
          WHERE tenant_id = $1::uuid
            AND ((embedding_next_at IS NULL AND (embedding_updated_at IS NULL OR embedding_updated_at < updated_at))
                 OR embedding_next_at <= now())
          ORDER BY updated_at LIMIT $2`,
        [tenantId, limit],
      );
      return r.rows;
    });
    let stored = 0;
    for (const row of due) if (await this.embedOne(tenantId, row)) stored += 1;
    return stored;
  }

  private async embedOne(tenantId: string, row: DueRow): Promise<boolean> {
    const actor = { tenantId, userId: row.user_id };
    const snapshot = new Date(row.updated_at).toISOString();
    const text = buildProfileText(row.fields);

    if (text.length === 0) {
      await this.db.transaction(actor, (tx) =>
        tx.query(
          `UPDATE opps.student_profiles
              SET embedding = NULL, embedding_stale = false, embedding_attempts = 0, embedding_next_at = NULL,
                  embedding_updated_at = $3::timestamptz
            WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
          [tenantId, row.user_id, snapshot],
        ),
      );
      return false;
    }

    let vector: readonly number[] | undefined;
    try {
      // Only redacted text reaches the adapter (10.14). A redaction failure means the adapter is not called.
      const redacted = await this.options.redactor.redact(text, { tenantId });
      const result = await this.options.ai.embed(
        { purpose: 'embed', texts: [redacted.text] },
        { timeoutMs: EMBED_TIMEOUT_MS },
      );
      if (result.type === 'success' && result.data.vectors.length === 1) {
        const v = result.data.vectors[0];
        if (v !== undefined && v.length === PROFILE_EMBEDDING_DIMENSIONS && v.every(Number.isFinite)) vector = v;
      }
    } catch {
      vector = undefined;
    }

    await this.db.transaction(actor, async (tx) => {
      if (vector !== undefined) {
        await tx.query(
          `UPDATE opps.student_profiles
              SET embedding = $3::vector, embedding_stale = false, embedding_attempts = 0, embedding_next_at = NULL,
                  embedding_updated_at = $4::timestamptz
            WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
          [tenantId, row.user_id, `[${vector.join(',')}]`, snapshot],
        );
        return;
      }
      // Failure: keep the previous vector, flag stale and schedule the next retry (10.8).
      const attempts = row.embedding_attempts + 1;
      const exhausted = attempts > EMBEDDING_REGENERATION_POLICY.maxRetries;
      await tx.query(
        `UPDATE opps.student_profiles
            SET embedding_stale = true, embedding_attempts = $3,
                embedding_next_at = CASE WHEN $4::boolean THEN NULL
                                         ELSE now() + ($5::bigint * interval '1 millisecond') END,
                embedding_updated_at = CASE WHEN $4::boolean THEN $6::timestamptz ELSE embedding_updated_at END
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [
          tenantId,
          row.user_id,
          exhausted ? 0 : attempts,
          exhausted,
          retryDelayMs(EMBEDDING_REGENERATION_POLICY, attempts - 1),
          snapshot,
        ],
      );
    });
    return vector !== undefined;
  }
}

/**
 * Consent-gated income band (10.5, 10.6, 19.2). On withdrawal the stored value is deleted and a `ProfileChanged`
 * event enqueues re-matching, which the outbox delivers well inside 5 minutes.
 */
export class IncomeBandConsentHandler {
  constructor(
    private readonly profiles: ProfileService,
    private readonly consents: ConsentService,
    private readonly database: ProfileDatabase,
  ) {}

  /** Call after `ConsentService.withdraw` succeeds for any purpose. Other purposes are ignored. */
  async onConsentWithdrawn(tenantId: string, userId: string, purpose: string): Promise<void> {
    if (purpose !== INCOME_BAND_PURPOSE) return;
    await this.profiles.removeIncomeBand(tenantId, userId);
  }

  /**
   * Safety net, run every few minutes: deletes income bands held without a current grant, so a missed callback
   * cannot leave the value in matching. Returns the number of bands removed.
   */
  async reconcile(tenantId: string, limit = 200): Promise<number> {
    const holders = await this.database.transaction({ tenantId }, async (tx: ProfileSqlClient) => {
      const r = await tx.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id FROM opps.student_profiles
          WHERE tenant_id = $1::uuid AND fields ? 'incomeBand' LIMIT $2`,
        [tenantId, limit],
      );
      return r.rows;
    });
    let removed = 0;
    for (const { user_id: userId } of holders) {
      if (await this.consents.hasConsent(tenantId, userId, INCOME_BAND_PURPOSE)) continue;
      await this.profiles.removeIncomeBand(tenantId, userId);
      removed += 1;
    }
    return removed;
  }
}
