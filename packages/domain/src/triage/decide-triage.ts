// Pure triage decision (Requirements 5.4, 5.5, 5.6, 5.9, 5.10). Advisory only: no I/O.
import { safetySignal } from './safety-lexicon';

export type TriageBand = 'P0' | 'P1' | 'P2' | 'P3';
const BAND_ORDER: readonly TriageBand[] = ['P3', 'P2', 'P1', 'P0'];

export interface TriageCategory {
  readonly id: string;
  readonly defaultBand: TriageBand;
  readonly defaultDepartmentId?: string;
}

export interface RoutingRule {
  readonly categoryId: string;
  readonly departmentId: string;
  readonly keywords?: readonly string[];
}

export interface AiScore {
  readonly label: string;
  readonly score: unknown;
}

export interface AiTriageOutput {
  readonly categoryScores?: readonly AiScore[];
  readonly departmentScores?: readonly AiScore[];
  readonly band?: unknown;
  readonly safetyRisk?: unknown;
}

export interface DecideTriageInput {
  /** AI output; null when the AI call failed, timed out or the circuit was open (fallback rules). */
  readonly ai: AiTriageOutput | null;
  readonly text: string;
  readonly categories: readonly TriageCategory[];
  readonly departmentIds: readonly string[];
  readonly routingRules: readonly RoutingRule[];
  readonly defaultDepartmentId: string;
  readonly threshold: number;
}

/** The only status command triage may issue (5.9). */
export type TriageRoutingCommand = { readonly from: 'New'; readonly to: 'Assigned' };

export interface TriageDecision {
  readonly categoryId: string;
  readonly categoryConfidence: number;
  readonly departmentId: string;
  readonly departmentConfidence: number;
  readonly band: TriageBand;
  readonly safetyForcedP0: boolean;
  readonly needsVerification: boolean;
  readonly source: 'ai' | 'rules';
  readonly command: TriageRoutingCommand;
}

const ROUTING_COMMAND: TriageRoutingCommand = { from: 'New', to: 'Assigned' };

/** Normalise any score to [0, 1]; malformed values become 0. Percent-style values (1 < x <= 100) are scaled. */
export function normaliseConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return Math.round(value * 100) / 100;
  if (value <= 100) return Math.round(value) / 100;
  return 1;
}

function isBand(value: unknown): value is TriageBand {
  return typeof value === 'string' && (BAND_ORDER as readonly string[]).includes(value);
}

function maxBand(a: TriageBand, b: TriageBand): TriageBand {
  return BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;
}

function topScore(
  scores: readonly AiScore[] | undefined,
  allowed: ReadonlySet<string>,
): { label: string; confidence: number } | null {
  let best: { label: string; confidence: number } | null = null;
  for (const s of scores ?? []) {
    if (!s || typeof s.label !== 'string' || !allowed.has(s.label)) continue;
    const confidence = normaliseConfidence(s.score);
    if (best === null || confidence > best.confidence) best = { label: s.label, confidence };
  }
  return best;
}

/** Keyword routing over routing_rules; rules with keywords need a match, rules without are category-wide. */
export function routeByRules(
  rules: readonly RoutingRule[],
  categoryId: string | null,
  text: string,
): { categoryId: string; departmentId: string } | null {
  const lowered = text.toLowerCase();
  const keywordHit = rules.find(
    (r) =>
      (categoryId === null || r.categoryId === categoryId) &&
      (r.keywords?.length ?? 0) > 0 &&
      r.keywords!.some((k) => k.length > 0 && lowered.includes(k.toLowerCase())),
  );
  if (keywordHit) return { categoryId: keywordHit.categoryId, departmentId: keywordHit.departmentId };
  if (categoryId === null) return null;
  const plain = rules.find((r) => r.categoryId === categoryId && (r.keywords?.length ?? 0) === 0);
  return plain ? { categoryId, departmentId: plain.departmentId } : null;
}

export function decideTriage(input: DecideTriageInput): TriageDecision {
  const { ai, categories, routingRules, threshold } = input;
  const categoryIds = new Set(categories.map((c) => c.id));
  const departmentIds = new Set(input.departmentIds);
  const fallbackCategory = categories[0];
  if (!fallbackCategory) throw new Error('decideTriage requires at least one active category');

  const aiCategory = ai ? topScore(ai.categoryScores, categoryIds) : null;
  const source: 'ai' | 'rules' = ai && aiCategory ? 'ai' : 'rules';

  let categoryId: string;
  let categoryConfidence: number;
  let departmentId: string | null = null;
  let departmentConfidence = 0;

  if (aiCategory) {
    categoryId = aiCategory.label;
    categoryConfidence = aiCategory.confidence;
  } else {
    const ruled = routeByRules(routingRules, null, input.text);
    categoryId = ruled && categoryIds.has(ruled.categoryId) ? ruled.categoryId : fallbackCategory.id;
    categoryConfidence = 0;
    departmentId = ruled?.departmentId ?? null;
  }

  const category = categories.find((c) => c.id === categoryId) ?? fallbackCategory;

  if (departmentId === null) {
    const rule = routeByRules(routingRules, categoryId, input.text);
    if (rule) {
      departmentId = rule.departmentId;
      departmentConfidence = categoryConfidence;
    } else {
      const aiDept = ai ? topScore(ai.departmentScores, departmentIds) : null;
      if (aiDept) {
        departmentId = aiDept.label;
        departmentConfidence = aiDept.confidence;
      } else {
        departmentId = category.defaultDepartmentId ?? input.defaultDepartmentId;
        departmentConfidence = 0;
      }
    }
  }

  const lexicon = safetySignal(input.text);
  const safetyForcedP0 = lexicon !== null || (ai !== null && ai.safetyRisk === true);
  let band: TriageBand = category.defaultBand;
  if (ai && isBand(ai.band)) band = maxBand(band, ai.band);
  if (safetyForcedP0) band = 'P0';

  const needsVerification =
    source === 'rules' || categoryConfidence < threshold || departmentConfidence < threshold;

  return {
    categoryId,
    categoryConfidence,
    departmentId,
    departmentConfidence,
    band,
    safetyForcedP0,
    needsVerification,
    source,
    command: ROUTING_COMMAND,
  };
}
