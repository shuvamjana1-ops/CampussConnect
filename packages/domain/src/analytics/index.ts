// @campusconnect/domain/analytics: metric registry and target evaluation.
// Pure functions only. Rates are fractions in [0, 1]; times are hours; CSAT is 1 to 5.

export type PriorityBand = 'P0' | 'P1' | 'P2' | 'P3';

export interface TicketFact {
  readonly department: string;
  readonly category: string;
  readonly band: PriorityBand;
  readonly routed: boolean;
  readonly reassignedDepartment: boolean;
  readonly escalationLevel: 0 | 1 | 2 | 3;
  readonly closed: boolean;
  readonly withdrawn: boolean;
  readonly resolved: boolean;
  readonly breached: boolean;
  readonly resolvedWithinSla: boolean;
  /** Disputed or reopened within 7 days of closure. */
  readonly disputedOrReopenedWithin7d: boolean;
  readonly disputed: boolean;
  readonly reopened: boolean;
  /** Closure time, ms epoch. */
  readonly closedAtMs?: number;
  /** First-response elapsed SLA time in hours. */
  readonly firstResponseHours?: number;
  readonly csat?: number;
}

export interface MetricFilter {
  readonly department?: string;
  readonly category?: string;
  readonly band?: PriorityBand;
  readonly k: number;
  /** Used for VOTR provisional handling. */
  readonly nowMs: number;
}

export type InsufficientReason = 'below_k' | 'zero_denominator';

export type MetricResult =
  | {
      readonly status: 'ok';
      readonly value: number;
      readonly n: number;
      readonly denominator: number;
      readonly provisional?: boolean;
    }
  | {
      readonly status: 'insufficient_data';
      readonly reason: InsufficientReason;
      readonly n: number;
      readonly denominator: number;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export type MetricId =
  | 'votr'
  | 'first_response_time'
  | 'sla_breach_rate'
  | 'escalation_rate'
  | 'misrouting_rate'
  | 'dispute_rate'
  | 'reopen_rate'
  | 'csat'
  | 'wau_mau_ratio'
  | 'activation_rate';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function metricUnavailable(reason: string): MetricResult {
  return { status: 'unavailable', reason };
}

function applyFilter(facts: readonly TicketFact[], f: MetricFilter): TicketFact[] {
  return facts.filter(
    (t) =>
      (f.department === undefined || t.department === f.department) &&
      (f.category === undefined || t.category === f.category) &&
      (f.band === undefined || t.band === f.band),
  );
}

function finish(
  value: number,
  n: number,
  denominator: number,
  k: number,
  provisional?: boolean,
): MetricResult {
  if (denominator === 0) {
    return { status: 'insufficient_data', reason: 'zero_denominator', n, denominator };
  }
  if (denominator < k) {
    return { status: 'insufficient_data', reason: 'below_k', n, denominator };
  }
  return provisional === undefined
    ? { status: 'ok', value, n, denominator }
    : { status: 'ok', value, n, denominator, provisional };
}

function ratio(
  facts: readonly TicketFact[],
  f: MetricFilter,
  inDenominator: (t: TicketFact) => boolean,
  inNumerator: (t: TicketFact) => boolean,
): MetricResult {
  const den = applyFilter(facts, f).filter(inDenominator);
  const num = den.filter(inNumerator).length;
  const d = den.length;
  return finish(d === 0 ? 0 : num / d, d, d, f.k);
}

export function votr(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  const den = applyFilter(facts, f).filter((t) => t.closed && !t.withdrawn);
  const good = den.filter((t) => t.resolvedWithinSla && !t.disputedOrReopenedWithin7d).length;
  const provisional = den.some(
    (t) => t.closedAtMs !== undefined && f.nowMs - t.closedAtMs < SEVEN_DAYS_MS,
  );
  const d = den.length;
  return finish(d === 0 ? 0 : good / d, d, d, f.k, provisional);
}

export function medianFirstResponse(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  const xs = applyFilter(facts, f)
    .map((t) => t.firstResponseHours)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return finish(0, 0, 0, f.k);
  const mid = Math.floor(n / 2);
  const value = n % 2 === 1 ? (xs[mid] as number) : ((xs[mid - 1] as number) + (xs[mid] as number)) / 2;
  return finish(value, n, n, f.k);
}

export function slaBreachRate(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  return ratio(facts, f, (t) => t.resolved || t.breached, (t) => t.breached);
}

export function escalationRate(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  return ratio(facts, f, (t) => t.routed, (t) => t.escalationLevel >= 1);
}

export function misroutingRate(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  return ratio(facts, f, (t) => t.routed, (t) => t.reassignedDepartment);
}

export function disputeRate(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  return ratio(facts, f, (t) => t.resolved, (t) => t.disputed);
}

export function reopenRate(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  return ratio(facts, f, (t) => t.closed, (t) => t.reopened);
}

export function csat(facts: readonly TicketFact[], f: MetricFilter): MetricResult {
  const xs = applyFilter(facts, f)
    .map((t) => t.csat)
    .filter((x): x is number => x !== undefined && x >= 1 && x <= 5);
  const n = xs.length;
  const mean = n === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / n;
  return finish(mean, n, n, f.k);
}

export interface ActivityCounts {
  readonly weeklyActive: number;
  readonly monthlyActive: number;
  readonly activated: number;
  readonly enrolled: number;
}

export function weeklyToMonthlyActiveRatio(a: ActivityCounts, k: number): MetricResult {
  return finish(a.monthlyActive === 0 ? 0 : a.weeklyActive / a.monthlyActive, a.weeklyActive, a.monthlyActive, k);
}

export function activationRate(a: ActivityCounts, k: number): MetricResult {
  return finish(a.enrolled === 0 ? 0 : a.activated / a.enrolled, a.activated, a.enrolled, k);
}

/** Run a metric, converting a thrown failure into a per-metric unavailable state (21.12). */
export function safeMetric(compute: () => MetricResult): MetricResult {
  try {
    return compute();
  } catch (e) {
    return metricUnavailable(e instanceof Error ? e.message : 'computation_failed');
  }
}

// ---- Targets ----

export type TargetDirection = 'at_least' | 'at_most';
export type TargetMonth = 3 | 6 | 12;
export type TargetStatus = 'met' | 'not_met' | 'insufficient_data' | 'unavailable';

export interface MetricTarget {
  readonly direction: TargetDirection;
  readonly byMonth: Readonly<Record<TargetMonth, number>>;
}

export const METRIC_TARGETS: Readonly<Partial<Record<MetricId, MetricTarget>>> = {
  votr: { direction: 'at_least', byMonth: { 3: 0.65, 6: 0.8, 12: 0.9 } },
  first_response_time: { direction: 'at_most', byMonth: { 3: 24, 6: 4, 12: 2 } },
  sla_breach_rate: { direction: 'at_most', byMonth: { 3: 0.25, 6: 0.15, 12: 0.08 } },
  misrouting_rate: { direction: 'at_most', byMonth: { 3: 0.1, 6: 0.05, 12: 0.03 } },
  wau_mau_ratio: { direction: 'at_least', byMonth: { 3: 0.3, 6: 0.4, 12: 0.5 } },
  activation_rate: { direction: 'at_least', byMonth: { 3: 0.4, 6: 0.6, 12: 0.75 } },
  dispute_rate: { direction: 'at_most', byMonth: { 3: 0.12, 6: 0.08, 12: 0.06 } },
  csat: { direction: 'at_least', byMonth: { 3: 3.8, 6: 4.1, 12: 4.4 } },
};

export function evaluateTarget(value: number, target: number, direction: TargetDirection): 'met' | 'not_met' {
  const met = direction === 'at_least' ? value >= target : value <= target;
  return met ? 'met' : 'not_met';
}

export function evaluateMetricTarget(
  id: MetricId,
  result: MetricResult,
  month: TargetMonth,
): TargetStatus | undefined {
  const t = METRIC_TARGETS[id];
  if (t === undefined) return undefined;
  if (result.status === 'unavailable') return 'unavailable';
  if (result.status === 'insufficient_data') return 'insufficient_data';
  return evaluateTarget(result.value, t.byMonth[month], t.direction);
}

// ---- Notable change and guardrails ----

export const NOTABLE_CHANGE_THRESHOLD = 0.1;

/** True when the relative change versus the previous value is 10 percent or more. */
export function isNotableChange(current: number, previous: number): boolean {
  if (previous === 0) return current !== 0;
  return Math.abs(current - previous) / Math.abs(previous) >= NOTABLE_CHANGE_THRESHOLD - 1e-12;
}

export type GuardrailId =
  | 'pii_exposure_incidents'
  | 'p0_false_negative_rate'
  | 'ai_override_rate'
  | 'exposure_parity';

/** Breach rule: any PII exposure count above 0 breaches; others breach when above their threshold. */
export function isGuardrailBreached(id: GuardrailId, value: number, threshold?: number): boolean {
  if (id === 'pii_exposure_incidents') return value > 0;
  if (threshold === undefined) return false;
  return value > threshold;
}
