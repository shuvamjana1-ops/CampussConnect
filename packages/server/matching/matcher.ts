// Matching core (requirements 11.1 to 11.4, 11.7, 11.10). Eligibility runs in TypeScript, cosine similarity runs in
// pgvector. Protected attributes feed eligibility only: the embeddings are built from an allowlist that excludes them.

import {
  adjustedQuery,
  candidacy,
  normalise,
  type Candidacy,
  type Json,
  type Profile,
  type Rule,
} from '@campusconnect/domain/eligibility';
import { explain } from '@campusconnect/domain/recommendations';
import type { ProfileSqlClient } from '../opportunities/profile.types';
import { MATCH_BATCH_SIZE, MATCH_STUDENT_OPPORTUNITY_LIMIT, type MatchSettings } from './matching.types';

type StoredFields = Record<string, { value?: Json } | undefined>;

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Profile values by field name, as the eligibility rules see them. */
export function profileOf(fields: StoredFields): Profile {
  const out: Record<string, Json | undefined> = {};
  for (const [name, entry] of Object.entries(fields)) out[name] = entry?.value;
  return out;
}

function isRule(value: unknown): value is Rule {
  if (typeof value !== 'object' || value === null) return false;
  return 'all' in value || 'any' in value || 'not' in value || 'field' in value;
}

/** Opportunities without usable rules have no criteria, so every Student is a candidate. */
export function ruleOf(raw: unknown): Rule {
  return isRule(raw) ? raw : { all: [] };
}

function tagsOf(profile: Profile): string[] {
  const out: string[] = [];
  for (const name of ['skills', 'interests']) {
    const v = profile[name];
    if (Array.isArray(v)) for (const t of v) if (typeof t === 'string') out.push(t);
  }
  return out;
}

/** Mirrors `score` in domain/eligibility for a cosine already computed by pgvector (11.1). */
export function scoreFromCosine(cos: number, s0: number): number {
  const denom = 1 - s0;
  const raw = denom <= 0 ? (cos >= 1 ? 1 : 0) : (cos - s0) / denom;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return Math.round(100 * clamped);
}

export function parseVector(text: string): number[] {
  return text
    .slice(1, -1)
    .split(',')
    .map(Number);
}

interface MatchRow {
  readonly studentId: string;
  readonly opportunityId: string;
  readonly score: number;
  readonly cand: Candidacy;
  readonly explanation: string[];
}

function toMatchRow(
  studentId: string,
  opportunityId: string,
  score: number,
  cand: Candidacy,
  profile: Profile,
): MatchRow {
  const program = typeof profile.program === 'string' ? profile.program : undefined;
  const explanation = explain(
    { id: opportunityId, score, hidden: false, criteria: cand.criteria, ...(program ? { program } : {}) },
    tagsOf(profile),
  );
  return { studentId, opportunityId, score, cand, explanation };
}

export class Matcher {
  constructor(private readonly settings: MatchSettings) {}

  /**
   * Query vector q for a Student: the profile embedding moved toward Opportunities marked relevant and away from those
   * marked not relevant (11.7). Undefined when the Student has no embedding.
   */
  private async queryVector(tx: ProfileSqlClient, tenantId: string, studentId: string): Promise<number[] | undefined> {
    const p = await tx.query<{ embedding: string | null }>(
      `SELECT embedding::text AS embedding FROM opps.student_profiles WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [tenantId, studentId],
    );
    const text = p.rows[0]?.embedding;
    if (text === null || text === undefined) return undefined;
    return this.adjust(tx, tenantId, studentId, parseVector(text));
  }

  private async adjust(
    tx: ProfileSqlClient,
    tenantId: string,
    studentId: string,
    profileEmbedding: number[],
  ): Promise<number[]> {
    const marked = await tx.query<{ feedback: string; embedding: string }>(
      `SELECT f.feedback, o.embedding::text AS embedding
         FROM opps.match_feedback f
         JOIN opps.opportunities o ON o.tenant_id = f.tenant_id AND o.id = f.opportunity_id
        WHERE f.tenant_id = $1::uuid AND f.student_id = $2::uuid
          AND f.feedback IN ('relevant', 'not_relevant') AND o.embedding IS NOT NULL`,
      [tenantId, studentId],
    );
    if (marked.rows.length === 0) return normalise(profileEmbedding);
    const relevant = marked.rows.filter((r) => r.feedback === 'relevant').map((r) => parseVector(r.embedding));
    const notRelevant = marked.rows.filter((r) => r.feedback === 'not_relevant').map((r) => parseVector(r.embedding));
    return adjustedQuery(profileEmbedding, relevant, notRelevant, this.settings.alpha, this.settings.beta);
  }

  /**
   * Matches every Student against one published Opportunity, paging Students in batches of 1,000 (11.1). Students who
   * are not candidates lose any stored match (11.2). Returns the number of matches stored.
   */
  async matchOpportunity(tx: ProfileSqlClient, tenantId: string, opportunityId: string): Promise<number> {
    const opp = await tx.query<{ eligibility_rules: unknown; has_embedding: boolean; status: string }>(
      `SELECT eligibility_rules, embedding IS NOT NULL AS has_embedding, status
         FROM opps.opportunities WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, opportunityId],
    );
    const o = opp.rows[0];
    if (o === undefined || o.status !== 'published') return 0;
    // The embedding job may not have finished yet. Fail so the consumer retries with backoff.
    if (!o.has_embedding) throw new Error(`Opportunity ${opportunityId} has no embedding yet.`);
    const rule = ruleOf(o.eligibility_rules);

    let after = NIL_UUID;
    let stored = 0;
    for (;;) {
      const page = await tx.query<{
        user_id: string;
        fields: StoredFields;
        cos: number | string | null;
        has_feedback: boolean;
      }>(
        `SELECT sp.user_id::text AS user_id, sp.fields,
                CASE WHEN sp.embedding IS NULL THEN NULL ELSE 1 - (sp.embedding <=> o.embedding) END AS cos,
                EXISTS (SELECT 1 FROM opps.match_feedback f
                         WHERE f.tenant_id = sp.tenant_id AND f.student_id = sp.user_id
                           AND f.feedback IN ('relevant', 'not_relevant')) AS has_feedback
           FROM opps.student_profiles sp
           JOIN opps.opportunities o ON o.tenant_id = sp.tenant_id AND o.id = $2::uuid
          WHERE sp.tenant_id = $1::uuid AND sp.user_id > $3::uuid
          ORDER BY sp.user_id LIMIT $4`,
        [tenantId, opportunityId, after, MATCH_BATCH_SIZE],
      );
      if (page.rows.length === 0) break;

      const keep: MatchRow[] = [];
      const drop: string[] = [];
      for (const row of page.rows) {
        const profile = profileOf(row.fields);
        const cand = candidacy(rule, profile);
        if (!cand.candidate) {
          drop.push(row.user_id);
          continue;
        }
        let cos = row.cos === null ? null : Number(row.cos);
        if (row.has_feedback && cos !== null) {
          const q = await this.queryVector(tx, tenantId, row.user_id);
          if (q !== undefined) {
            const r = await tx.query<{ cos: number | string }>(
              `SELECT 1 - ($3::vector <=> embedding) AS cos FROM opps.opportunities
                WHERE tenant_id = $1::uuid AND id = $2::uuid`,
              [tenantId, opportunityId, `[${q.join(',')}]`],
            );
            cos = Number(r.rows[0]?.cos ?? cos);
          }
        }
        keep.push(toMatchRow(row.user_id, opportunityId, cos === null ? 0 : scoreFromCosine(cos, this.settings.s0), cand, profile));
      }
      await this.deleteMatches(tx, tenantId, drop, [opportunityId]);
      await this.upsertMatches(tx, tenantId, keep);
      stored += keep.length;
      after = page.rows[page.rows.length - 1]?.user_id ?? after;
      if (page.rows.length < MATCH_BATCH_SIZE) break;
    }
    return stored;
  }

  /**
   * Re-matches one Student against every open Opportunity after a profile, consent or feedback change (11.7).
   * Returns the number of matches stored.
   */
  async matchStudent(tx: ProfileSqlClient, tenantId: string, studentId: string): Promise<number> {
    const prof = await tx.query<{ fields: StoredFields }>(
      `SELECT fields FROM opps.student_profiles WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [tenantId, studentId],
    );
    if (prof.rows[0] === undefined) return 0;
    const profile = profileOf(prof.rows[0].fields);
    const q = await this.queryVector(tx, tenantId, studentId);

    const opps = await tx.query<{ id: string; eligibility_rules: unknown; cos: number | string | null }>(
      `SELECT id::text AS id, eligibility_rules,
              CASE WHEN $3::text IS NULL THEN NULL ELSE 1 - ($3::vector <=> embedding) END AS cos
         FROM opps.opportunities
        WHERE tenant_id = $1::uuid AND status = 'published' AND deadline > now() AND embedding IS NOT NULL
        ORDER BY id LIMIT $2`,
      [tenantId, MATCH_STUDENT_OPPORTUNITY_LIMIT, q === undefined ? null : `[${q.join(',')}]`],
    );
    const keep: MatchRow[] = [];
    const drop: string[] = [];
    for (const o of opps.rows) {
      const cand = candidacy(ruleOf(o.eligibility_rules), profile);
      if (!cand.candidate) {
        drop.push(o.id);
        continue;
      }
      const score = o.cos === null ? 0 : scoreFromCosine(Number(o.cos), this.settings.s0);
      keep.push(toMatchRow(studentId, o.id, score, cand, profile));
    }
    await this.deleteMatches(tx, tenantId, [studentId], drop);
    await this.upsertMatches(tx, tenantId, keep);
    return keep.length;
  }

  /** Removes every match for an Opportunity, used when it expires so it leaves recommendations (10.13). */
  async clearOpportunity(tx: ProfileSqlClient, tenantId: string, opportunityId: string): Promise<void> {
    await tx.query(`DELETE FROM opps.matches WHERE tenant_id = $1::uuid AND opportunity_id = $2::uuid`, [
      tenantId,
      opportunityId,
    ]);
  }

  private async deleteMatches(
    tx: ProfileSqlClient,
    tenantId: string,
    studentIds: readonly string[],
    opportunityIds: readonly string[],
  ): Promise<void> {
    if (studentIds.length === 0 || opportunityIds.length === 0) return;
    await tx.query(
      `DELETE FROM opps.matches
        WHERE tenant_id = $1::uuid AND student_id = ANY($2::uuid[]) AND opportunity_id = ANY($3::uuid[])`,
      [tenantId, studentIds, opportunityIds],
    );
  }

  private async upsertMatches(tx: ProfileSqlClient, tenantId: string, rows: readonly MatchRow[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.query(
      `INSERT INTO opps.matches (tenant_id, student_id, opportunity_id, score, result, criteria, explanation, matched_at)
       SELECT $1::uuid, s, o, sc, r, c::jsonb, e::jsonb, now()
         FROM unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[], $7::text[]) AS t(s, o, sc, r, c, e)
       ON CONFLICT (tenant_id, student_id, opportunity_id) DO UPDATE
         SET score = EXCLUDED.score, result = EXCLUDED.result, criteria = EXCLUDED.criteria,
             explanation = EXCLUDED.explanation, matched_at = EXCLUDED.matched_at`,
      [
        tenantId,
        rows.map((r) => r.studentId),
        rows.map((r) => r.opportunityId),
        rows.map((r) => r.score),
        rows.map((r) => r.cand.result),
        rows.map((r) => JSON.stringify(r.cand.criteria)),
        rows.map((r) => JSON.stringify(r.explanation)),
      ],
    );
  }
}
