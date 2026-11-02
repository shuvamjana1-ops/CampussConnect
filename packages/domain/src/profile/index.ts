// @campusconnect/domain/profile: Student profile completeness and exposure parity.

export interface CompletenessResult {
  readonly percent: number;
  readonly missing: readonly string[];
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Completeness = round(100 × filled / total) with the list of missing fields. */
export function completeness(
  profile: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): CompletenessResult {
  const unique = [...new Set(fields)];
  if (unique.length === 0) return { percent: 100, missing: [] };
  const missing = unique.filter((f) => !isFilled(profile[f]));
  const filled = unique.length - missing.length;
  return { percent: Math.round((100 * filled) / unique.length), missing };
}

export interface ExposureGroup {
  readonly dimension: string;
  readonly group: string;
  readonly size: number;
  /** Exposure rate as a percentage (0-100). */
  readonly rate: number;
}

export interface ExposureDisparity {
  readonly dimension: string;
  readonly groupA: string;
  readonly groupB: string;
  readonly differencePoints: number;
}

export const EXPOSURE_PARITY_THRESHOLD_POINTS = 10;

/** Same-dimension pairs differing by more than 10 points; groups below kEffective are suppressed. */
export function exposureParity(
  groups: readonly ExposureGroup[],
  kEffective: number,
): ExposureDisparity[] {
  const eligible = groups.filter((g) => g.size >= kEffective);
  const out: ExposureDisparity[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]!;
      const b = eligible[j]!;
      if (a.dimension !== b.dimension) continue;
      const diff = Math.abs(a.rate - b.rate);
      if (diff > EXPOSURE_PARITY_THRESHOLD_POINTS) {
        out.push({ dimension: a.dimension, groupA: a.group, groupB: b.group, differencePoints: diff });
      }
    }
  }
  return out;
}
