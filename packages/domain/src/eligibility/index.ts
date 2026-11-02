// @campusconnect/domain/eligibility: eligibility rule evaluation and match scoring.
// Pure, I/O-free. Kleene three-valued logic (11.2, 11.4, G10); scoring per design (11.1, 11.7, 11.10).

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type ProfileField = string;
export type Profile = Readonly<Record<string, Json | undefined>>;
export type Tri = 'met' | 'not_met' | 'unknown';
export type LeafOp = 'eq' | 'neq' | 'in' | 'nin' | 'gte' | 'lte' | 'between' | 'exists';

export interface LeafRule {
  id: string;
  label: string;
  field: ProfileField;
  op: LeafOp;
  value?: Json;
}
export type Rule = { all: Rule[] } | { any: Rule[] } | { not: Rule } | LeafRule;

export interface CriterionResult {
  id: string;
  label: string;
  result: Tri;
}
export interface EvaluationResult {
  result: Tri;
  criteria: CriterionResult[];
}

/** Fields that may appear in eligibility rules but never in semantic ranking (11.10). */
export const PROTECTED_FIELDS: readonly string[] = ['incomeBand', 'category', 'socialCategory', 'gender'];

const isMissing = (v: Json | undefined): boolean => v === undefined || v === null;

function deepEqual(a: Json | undefined, b: Json | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(a: Json, b: Json): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return undefined;
}

function evalLeaf(leaf: LeafRule, profile: Profile): Tri {
  const actual = profile[leaf.field];
  if (isMissing(actual)) return 'unknown';
  if (leaf.op === 'exists') return 'met';
  const a = actual as Json;
  const v = leaf.value;
  if (v === undefined) return 'unknown';
  const yes = (b: boolean): Tri => (b ? 'met' : 'not_met');
  switch (leaf.op) {
    case 'eq':
      return yes(deepEqual(a, v));
    case 'neq':
      return yes(!deepEqual(a, v));
    case 'in':
      return Array.isArray(v) ? yes(v.some((x) => deepEqual(a, x))) : 'unknown';
    case 'nin':
      return Array.isArray(v) ? yes(!v.some((x) => deepEqual(a, x))) : 'unknown';
    case 'gte': {
      const c = compare(a, v);
      return c === undefined ? 'unknown' : yes(c >= 0);
    }
    case 'lte': {
      const c = compare(a, v);
      return c === undefined ? 'unknown' : yes(c <= 0);
    }
    case 'between': {
      if (!Array.isArray(v) || v.length !== 2) return 'unknown';
      const lo = compare(a, v[0] as Json);
      const hi = compare(a, v[1] as Json);
      return lo === undefined || hi === undefined ? 'unknown' : yes(lo >= 0 && hi <= 0);
    }
    default:
      return 'unknown';
  }
}

const triNot = (t: Tri): Tri => (t === 'met' ? 'not_met' : t === 'not_met' ? 'met' : 'unknown');

function triAll(ts: Tri[]): Tri {
  if (ts.includes('not_met')) return 'not_met';
  if (ts.includes('unknown')) return 'unknown';
  return 'met';
}

function triAny(ts: Tri[]): Tri {
  if (ts.includes('met')) return 'met';
  if (ts.includes('unknown')) return 'unknown';
  return 'not_met';
}

function walk(rule: Rule, profile: Profile, criteria: CriterionResult[]): Tri {
  if ('all' in rule) return triAll(rule.all.map((r) => walk(r, profile, criteria)));
  if ('any' in rule) return triAny(rule.any.map((r) => walk(r, profile, criteria)));
  if ('not' in rule) return triNot(walk(rule.not, profile, criteria));
  const result = evalLeaf(rule, profile);
  criteria.push({ id: rule.id, label: rule.label, result });
  return result;
}

/** Evaluate a rule tree with Kleene logic; every leaf appears once in the checklist. */
export function evaluate(rule: Rule, profile: Profile): EvaluationResult {
  const criteria: CriterionResult[] = [];
  const result = walk(rule, profile, criteria);
  return { result, criteria };
}

export interface Candidacy {
  candidate: boolean;
  result: Tri;
  criteria: CriterionResult[];
  /** Criteria with result `unknown`, flagged for the Student (G10). */
  flagged: CriterionResult[];
}

/** Only overall `not_met` excludes; `unknown` is a candidate with flagged criteria (11.2, G10). */
export function candidacy(rule: Rule, profile: Profile): Candidacy {
  const { result, criteria } = evaluate(rule, profile);
  return {
    candidate: result !== 'not_met',
    result,
    criteria,
    flagged: result === 'unknown' ? criteria.filter((c) => c.result === 'unknown') : [],
  };
}

/** Drop protected attributes so they can never feed semantic ranking (11.10). */
export function rankingInputs(profile: Profile): Profile {
  const out: Record<string, Json | undefined> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (!PROTECTED_FIELDS.includes(k)) out[k] = v;
  }
  return out;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

export function normalise(v: readonly number[]): number[] {
  const norm = Math.sqrt(dot(v, v));
  return norm === 0 ? v.slice() : v.map((x) => x / norm);
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const na = Math.sqrt(dot(a, a));
  const nb = Math.sqrt(dot(b, b));
  return na === 0 || nb === 0 ? 0 : dot(a, b) / (na * nb);
}

function mean(vs: readonly (readonly number[])[], dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  if (vs.length === 0) return out;
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] = (out[i] as number) + (v[i] ?? 0);
  return out.map((x) => x / vs.length);
}

/** q = normalise(p + α·mean(relevant) − β·mean(notRelevant)) (11.7). */
export function adjustedQuery(
  profileEmbedding: readonly number[],
  relevant: readonly (readonly number[])[],
  notRelevant: readonly (readonly number[])[],
  alpha: number,
  beta: number,
): number[] {
  const dim = profileEmbedding.length;
  const r = mean(relevant, dim);
  const n = mean(notRelevant, dim);
  return normalise(profileEmbedding.map((p, i) => p + alpha * (r[i] as number) - beta * (n[i] as number)));
}

/** score = round(100 × clamp((cos(q, o) − s0) / (1 − s0), 0, 1)), integer 0–100 (11.1). */
export function score(q: readonly number[], o: readonly number[], s0: number): number {
  const denom = 1 - s0;
  const raw = denom <= 0 ? (cosine(q, o) >= 1 ? 1 : 0) : (cosine(q, o) - s0) / denom;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return Math.round(100 * clamped);
}
