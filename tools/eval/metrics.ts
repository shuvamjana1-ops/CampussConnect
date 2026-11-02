// Pure evaluation metrics for the triage harness (5.8, 25.3).

export const MAX_P0_FALSE_NEGATIVE_RATE = 0.02;
const CALIBRATION_BINS = 10;

export interface EvalOutcome {
  readonly expectedBand: string;
  readonly decidedBand: string;
  /** Confidence of the chosen category, 0..1. */
  readonly confidence: number;
  /** True when the decided category equals the expected category. */
  readonly categoryCorrect: boolean;
}

export interface CalibrationBin {
  readonly lower: number;
  readonly upper: number;
  readonly count: number;
  readonly meanConfidence: number;
  readonly accuracy: number;
}

export interface EvalReport {
  readonly total: number;
  readonly p0Total: number;
  readonly p0FalseNegatives: number;
  /** P0 Critical false-negative rate: expected P0 not decided P0, over all expected P0. 0 when none. */
  readonly p0FalseNegativeRate: number;
  readonly categoryAccuracy: number;
  /** Expected calibration error: weighted mean |accuracy - confidence| over bins. */
  readonly expectedCalibrationError: number;
  readonly calibration: readonly CalibrationBin[];
  readonly passed: boolean;
}

export function buildReport(outcomes: readonly EvalOutcome[]): EvalReport {
  const p0 = outcomes.filter((o) => o.expectedBand === 'P0');
  const p0FalseNegatives = p0.filter((o) => o.decidedBand !== 'P0').length;
  const p0FalseNegativeRate = p0.length === 0 ? 0 : p0FalseNegatives / p0.length;

  const buckets: EvalOutcome[][] = Array.from({ length: CALIBRATION_BINS }, () => []);
  for (const o of outcomes) {
    const clamped = Math.min(1, Math.max(0, o.confidence));
    buckets[Math.min(CALIBRATION_BINS - 1, Math.floor(clamped * CALIBRATION_BINS))]!.push(o);
  }
  const calibration: CalibrationBin[] = [];
  let ece = 0;
  buckets.forEach((items, i) => {
    if (items.length === 0) return;
    const meanConfidence = items.reduce((s, o) => s + o.confidence, 0) / items.length;
    const accuracy = items.filter((o) => o.categoryCorrect).length / items.length;
    ece += (items.length / outcomes.length) * Math.abs(accuracy - meanConfidence);
    calibration.push({
      lower: i / CALIBRATION_BINS,
      upper: (i + 1) / CALIBRATION_BINS,
      count: items.length,
      meanConfidence,
      accuracy,
    });
  });

  return {
    total: outcomes.length,
    p0Total: p0.length,
    p0FalseNegatives,
    p0FalseNegativeRate,
    categoryAccuracy:
      outcomes.length === 0 ? 0 : outcomes.filter((o) => o.categoryCorrect).length / outcomes.length,
    expectedCalibrationError: ece,
    calibration,
    passed: p0FalseNegativeRate <= MAX_P0_FALSE_NEGATIVE_RATE,
  };
}
