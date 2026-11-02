// @campusconnect/domain/recommendations: Opportunity recommendation lists, weekly digests and explanations.
// Pure, I/O-free (10.13, 11.3, 11.5, 11.6, 11.8).
import type { CriterionResult } from '../eligibility/index.js';

export const DIGEST_MAX = 5;
export const EXPLAIN_MAX = 5;

export interface ScoredOpportunity {
  id: string;
  score: number;
  hidden: boolean;
  /** Expiry instant (ms since epoch); undefined means no expiry. */
  expiresAt?: number;
  tags?: readonly string[];
  program?: string;
  criteria?: readonly CriterionResult[];
}

const isVisible = (o: ScoredOpportunity, now: number): boolean =>
  !o.hidden && (o.expiresAt === undefined || o.expiresAt > now);

/** Score descending, ties broken by id for determinism. */
const byScore = (a: ScoredOpportunity, b: ScoredOpportunity): number =>
  b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Recommendations exclude hidden and expired Opportunities, ordered by score (11.5, 10.13). */
export function recommendationList<T extends ScoredOpportunity>(opportunities: readonly T[], now: number): T[] {
  return opportunities.filter((o) => isVisible(o, now)).sort(byScore);
}

/** Weekly digest: top min(5, n) by score; null when there is nothing to send (11.6). */
export function weeklyDigest<T extends ScoredOpportunity>(opportunities: readonly T[], now: number): T[] | null {
  const list = recommendationList(opportunities, now);
  return list.length === 0 ? null : list.slice(0, DIGEST_MAX);
}

/** Explanation: 1–5 attributes from met criteria and overlapping tags, else the program (11.3, 11.8). */
export function explain(
  opportunity: ScoredOpportunity,
  studentTags: readonly string[],
): string[] {
  const attrs: string[] = [];
  for (const c of opportunity.criteria ?? []) if (c.result === 'met') attrs.push(c.label);
  const mine = new Set(studentTags.map((t) => t.toLowerCase()));
  for (const t of opportunity.tags ?? []) if (mine.has(t.toLowerCase())) attrs.push(t);
  const unique = [...new Set(attrs)].slice(0, EXPLAIN_MAX);
  if (unique.length > 0) return unique;
  return [opportunity.program && opportunity.program.length > 0 ? opportunity.program : 'Your program'];
}
