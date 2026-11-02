// @campusconnect/domain/ai-quality: AI override rate, accuracy and calibration, and training-label eligibility.

/** One AI classification with its final Handler outcome. Deliberately has no Handler dimension. */
export interface ClassificationRecord {
  readonly categoryId: string;
  /** AI confidence in [0, 1]. */
  readonly confidence: number;
  /** AI category equals the final Handler-confirmed category. */
  readonly correct: boolean;
  /** Handler corrected the AI suggestion. */
  readonly overridden: boolean;
  /** Classification time (ms since epoch). */
  readonly at: number;
}

export interface CategoryQuality {
  readonly categoryId: string;
  readonly count: number;
  /** Percentage 0..100. */
  readonly overrideRate: number;
  /** Percentage 0..100. */
  readonly accuracy: number;
  /** |mean confidence - accuracy| in percentage points. */
  readonly calibration: number;
  readonly modelReviewFlag: boolean;
}

export const MODEL_REVIEW_OVERRIDE_THRESHOLD_PCT = 30;
export const MODEL_REVIEW_MIN_CLASSIFICATIONS = 50;
export const MODEL_REVIEW_WINDOW_DAYS = 7;
export const OVERRIDE_RATE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Per-category quality over the window (now - windowDays, now]. The model-review flag requires
 * an override rate above 30% and at least 50 classifications in the window.
 */
export function computeCategoryQuality(
  records: readonly ClassificationRecord[],
  now: number,
  windowDays: number = MODEL_REVIEW_WINDOW_DAYS,
): CategoryQuality[] {
  const from = now - windowDays * DAY_MS;
  const groups = new Map<string, ClassificationRecord[]>();
  for (const r of records) {
    if (r.at <= from || r.at > now) continue;
    const g = groups.get(r.categoryId);
    if (g) g.push(r);
    else groups.set(r.categoryId, [r]);
  }
  const out: CategoryQuality[] = [];
  for (const [categoryId, g] of groups) {
    const n = g.length;
    const overrideRate = (g.filter((r) => r.overridden).length / n) * 100;
    const accuracy = (g.filter((r) => r.correct).length / n) * 100;
    const meanConf = (g.reduce((s, r) => s + r.confidence, 0) / n) * 100;
    out.push({
      categoryId,
      count: n,
      overrideRate,
      accuracy,
      calibration: Math.abs(meanConf - accuracy),
      modelReviewFlag:
        n >= MODEL_REVIEW_MIN_CLASSIFICATIONS && overrideRate > MODEL_REVIEW_OVERRIDE_THRESHOLD_PCT,
    });
  }
  return out.sort((a, b) => (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0));
}

export type TrainingExclusionReason = 'TENANT_NOT_OPTED_IN' | 'REDACTION_FAILED';

export interface TrainingLabelCandidate {
  readonly tenantId: string;
  readonly tenantOptIn: boolean;
  readonly redactionSucceeded: boolean;
}

export interface TrainingLabelEligibility {
  readonly eligible: boolean;
  readonly exclusionReason: TrainingExclusionReason | null;
}

/** Eligible only with Tenant opt-in and successful redaction. */
export function trainingLabelEligibility(c: TrainingLabelCandidate): TrainingLabelEligibility {
  if (!c.tenantOptIn) return { eligible: false, exclusionReason: 'TENANT_NOT_OPTED_IN' };
  if (!c.redactionSucceeded) return { eligible: false, exclusionReason: 'REDACTION_FAILED' };
  return { eligible: true, exclusionReason: null };
}

/** Per-Tenant count of labels excluded from the training set. */
export function exclusionCountsByTenant(
  candidates: readonly TrainingLabelCandidate[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    if (!trainingLabelEligibility(c).eligible) {
      counts.set(c.tenantId, (counts.get(c.tenantId) ?? 0) + 1);
    }
  }
  return counts;
}
