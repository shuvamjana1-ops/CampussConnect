// OKR milestone, daily guardrail and nightly AI quality jobs (21.1 to 21.7, 21.10 to 21.12, 25.3, 25.4, 25.7).
// All outputs are aggregates without identity columns; ports supply data owned by other modules.

import {
  METRIC_TARGETS,
  csat,
  disputeRate,
  escalationRate,
  evaluateTarget,
  isGuardrailBreached,
  medianFirstResponse,
  misroutingRate,
  reopenRate,
  safeMetric,
  slaBreachRate,
  votr,
  weeklyToMonthlyActiveRatio,
  activationRate,
  type GuardrailId,
  type MetricId,
  type MetricResult,
  type TargetDirection,
  type TargetMonth,
  type TargetStatus,
} from '@campusconnect/domain/analytics';
import { computeCategoryQuality, type ClassificationRecord } from '@campusconnect/domain/ai-quality';
import { useTenant, type OutboxDatabase } from '../outbox';
import { loadActivityCounts, loadTicketFacts } from './fact-refresh-job';
import type { TenantLister } from './analytics.types';

const DAY_MS = 86_400_000;
export const OKR_MILESTONE_MONTHS: readonly TargetMonth[] = [3, 6, 12];
export const OKR_SWEEP_CADENCE_MS = 6 * 60 * 60 * 1000;
export const GUARDRAIL_CADENCE_MS = DAY_MS;
export const AI_QUALITY_CADENCE_MS = DAY_MS;
/** Operations are alerted when the nightly report has not completed within 15 minutes. */
export const AI_QUALITY_DEADLINE_MS = 15 * 60 * 1000;
const AI_QUALITY_LOOKBACK_DAYS = 30;

export interface OkrDirectory {
  /** Pilot launch date (UTC midnight, ms) of a Tenant, or undefined before launch. */
  launchedAtOf(tenantId: string): Promise<number | undefined>;
  kAnonymityOf(tenantId: string): Promise<number>;
  /** Active Students enrolled according to the ERP module. */
  enrolledStudentsOf(tenantId: string): Promise<number>;
}

export interface GuardrailMeasurement {
  readonly value: number;
  readonly threshold?: number;
}

/** Supplies the guardrail values (PII incidents, P0 false negatives, AI override rate, exposure parity). */
export interface GuardrailSource {
  measure(tenantId: string, day: string): Promise<Readonly<Record<GuardrailId, GuardrailMeasurement>>>;
}

export interface GuardrailNotifier {
  /** Notifies the platform product owner of a breach (G3). */
  breached(event: { tenantId: string; guardrail: GuardrailId; day: string; value: number; threshold?: number }): Promise<void>;
}

export interface ClassificationSource {
  load(tenantId: string, sinceMs: number, untilMs: number): Promise<readonly ClassificationRecord[]>;
}

export interface OperationsAlerter {
  aiQualityReportIncomplete(event: { tenantId: string; day: string; reason: string }): Promise<void>;
}

export interface OkrJobOptions {
  readonly onError?: (error: unknown, tenantId: string) => void;
  readonly now?: () => number;
}

const ids: readonly MetricId[] = [
  'votr',
  'first_response_time',
  'sla_breach_rate',
  'escalation_rate',
  'misrouting_rate',
  'dispute_rate',
  'reopen_rate',
  'csat',
  'wau_mau_ratio',
  'activation_rate',
];

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

abstract class TenantSweep {
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;

  protected constructor(
    protected readonly tenants: TenantLister,
    protected readonly options: OkrJobOptions,
    private readonly cadenceMs: number,
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.runOnce(), this.cadenceMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  protected nowMs(): number {
    return (this.options.now ?? Date.now)();
  }

  protected abstract processTenant(tenantId: string): Promise<boolean>;

  /** One Tenant's failure does not stop the others. Returns the number of Tenants processed. */
  async runOnce(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let done = 0;
    try {
      for (const tenantId of await this.tenants.listActiveTenantIds()) {
        try {
          if (await this.processTenant(tenantId)) done += 1;
        } catch (error) {
          this.options.onError?.(error, tenantId);
        }
      }
    } finally {
      this.busy = false;
    }
    return done;
  }
}

/** Computes every metric at the 3, 6 and 12 month milestones against `okr_targets` (idempotent, catches up missed ones). */
export class OkrMilestoneJob extends TenantSweep {
  constructor(
    private readonly reader: OutboxDatabase,
    private readonly writer: OutboxDatabase,
    tenants: TenantLister,
    private readonly directory: OkrDirectory,
    options: OkrJobOptions = {},
  ) {
    super(tenants, options, OKR_SWEEP_CADENCE_MS);
  }

  protected async processTenant(tenantId: string): Promise<boolean> {
    const launchedAt = await this.directory.launchedAtOf(tenantId);
    if (launchedAt === undefined) return false;
    const now = this.nowMs();
    let ran = false;
    for (const month of OKR_MILESTONE_MONTHS) {
      const milestoneMs = addMonths(launchedAt, month);
      if (milestoneMs > now) continue;
      if (await this.computeMilestone(tenantId, month, dayOf(milestoneMs), now)) ran = true;
    }
    return ran;
  }

  private async computeMilestone(tenantId: string, month: TargetMonth, takenOn: string, now: number): Promise<boolean> {
    const exists = await this.reader.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{ c: number }>(
        'SELECT count(*)::int AS c FROM analytics.metric_snapshots WHERE taken_on = $1::date',
        [takenOn],
      );
      return (r.rows[0]?.c ?? 0) > 0;
    });
    if (exists) return false;

    const k = await this.directory.kAnonymityOf(tenantId);
    const enrolled = await this.directory.enrolledStudentsOf(tenantId);
    const { facts, activity, targets } = await this.reader.transaction(async (tx) => {
      const f = await loadTicketFacts(tx, tenantId);
      const a = await loadActivityCounts(tx, tenantId, new Date(now), enrolled);
      const t = await tx.query<{ metric_id: string; direction: TargetDirection; target: string }>(
        'SELECT metric_id, direction, target FROM analytics.okr_targets WHERE month = $1',
        [month],
      );
      return { facts: f, activity: a, targets: t.rows };
    });

    const filter = { k, nowMs: now };
    const compute: Record<MetricId, () => MetricResult> = {
      votr: () => votr(facts, filter),
      first_response_time: () => medianFirstResponse(facts, filter),
      sla_breach_rate: () => slaBreachRate(facts, filter),
      escalation_rate: () => escalationRate(facts, filter),
      misrouting_rate: () => misroutingRate(facts, filter),
      dispute_rate: () => disputeRate(facts, filter),
      reopen_rate: () => reopenRate(facts, filter),
      csat: () => csat(facts, filter),
      wau_mau_ratio: () => weeklyToMonthlyActiveRatio(activity, k),
      activation_rate: () => activationRate(activity, k),
    };
    const overrides = new Map(targets.map((t) => [t.metric_id, t]));

    await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      for (const id of ids) {
        const result = safeMetric(compute[id]);
        const builtin = METRIC_TARGETS[id];
        const configured = overrides.get(id);
        const target =
          configured !== undefined
            ? { value: Number(configured.target), direction: configured.direction }
            : builtin !== undefined
              ? { value: builtin.byMonth[month], direction: builtin.direction }
              : undefined;
        let status: TargetStatus | null = null;
        if (target !== undefined) {
          status =
            result.status === 'ok'
              ? evaluateTarget(result.value, target.value, target.direction)
              : result.status;
        }
        await tx.query(
          `INSERT INTO analytics.metric_snapshots
             (tenant_id, metric_id, taken_on, status, value, n, denominator, reason, target_status)
           VALUES (app.tenant(), $1, $2::date, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, metric_id, taken_on) DO NOTHING`,
          [
            id,
            takenOn,
            result.status,
            result.status === 'ok' ? result.value : null,
            result.status === 'unavailable' ? null : result.n,
            result.status === 'unavailable' ? null : result.denominator,
            result.status === 'ok' ? null : result.reason.slice(0, 200),
            status,
          ],
        );
      }
    });
    return true;
  }
}

/** Daily guardrail computation; breaches are flagged and the platform product owner is notified within 24 hours. */
export class GuardrailJob extends TenantSweep {
  constructor(
    private readonly writer: OutboxDatabase,
    tenants: TenantLister,
    private readonly source: GuardrailSource,
    private readonly notifier: GuardrailNotifier,
    options: OkrJobOptions = {},
  ) {
    super(tenants, options, GUARDRAIL_CADENCE_MS);
  }

  protected async processTenant(tenantId: string): Promise<boolean> {
    const day = dayOf(this.nowMs());
    const measured = await this.source.measure(tenantId, day);
    const guardrails = Object.keys(measured) as GuardrailId[];
    await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      for (const guardrail of guardrails) {
        const m = measured[guardrail];
        await tx.query(
          `INSERT INTO analytics.guardrail_flags (tenant_id, guardrail, computed_on, value, threshold, breached)
           VALUES (app.tenant(), $1, $2::date, $3, $4, $5)
           ON CONFLICT (tenant_id, guardrail, computed_on) DO UPDATE SET
             value = EXCLUDED.value, threshold = EXCLUDED.threshold, breached = EXCLUDED.breached`,
          [guardrail, day, m.value, m.threshold ?? null, isGuardrailBreached(guardrail, m.value, m.threshold)],
        );
      }
    });
    await this.notifyPending(tenantId);
    return true;
  }

  /** Notifies every breach not yet notified (including earlier failures), then stamps `notified_at`. */
  private async notifyPending(tenantId: string): Promise<void> {
    const pending = await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const r = await tx.query<{ id: string; guardrail: GuardrailId; day: string; value: string; threshold: string | null }>(
        `SELECT id::text AS id, guardrail, computed_on::text AS day, value, threshold
         FROM analytics.guardrail_flags WHERE breached AND notified_at IS NULL ORDER BY computed_on`,
      );
      return r.rows;
    });
    for (const p of pending) {
      try {
        await this.notifier.breached({
          tenantId,
          guardrail: p.guardrail,
          day: p.day,
          value: Number(p.value),
          ...(p.threshold === null ? {} : { threshold: Number(p.threshold) }),
        });
        await this.writer.transaction(async (tx) => {
          await useTenant(tx, tenantId);
          await tx.query('UPDATE analytics.guardrail_flags SET notified_at = now() WHERE id = $1::bigint', [p.id]);
        });
      } catch (error) {
        this.options.onError?.(error, tenantId);
      }
    }
  }
}

/** Nightly per-category AI quality report. A report that fails or exceeds 15 minutes alerts operations; the previous report stays. */
export class AiQualityReportJob extends TenantSweep {
  constructor(
    private readonly writer: OutboxDatabase,
    tenants: TenantLister,
    private readonly source: ClassificationSource,
    private readonly alerter: OperationsAlerter,
    options: OkrJobOptions & { readonly deadlineMs?: number } = {},
    private readonly deadlineMs: number = options.deadlineMs ?? AI_QUALITY_DEADLINE_MS,
  ) {
    super(tenants, options, AI_QUALITY_CADENCE_MS);
  }

  protected async processTenant(tenantId: string): Promise<boolean> {
    const now = this.nowMs();
    const day = dayOf(now);
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error('deadline_exceeded'));
      }, this.deadlineMs);
    });
    try {
      await Promise.race([this.build(tenantId, now, day, () => expired), deadline]);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
      await this.alerter
        .aiQualityReportIncomplete({ tenantId, day, reason })
        .catch((e: unknown) => this.options.onError?.(e, tenantId));
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Writes all categories in one transaction so a partial report never replaces the previous one. */
  private async build(tenantId: string, now: number, day: string, isExpired: () => boolean): Promise<void> {
    const records = await this.source.load(tenantId, now - AI_QUALITY_LOOKBACK_DAYS * DAY_MS, now);
    const rows = computeCategoryQuality(records, now);
    if (isExpired()) return;
    await this.writer.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      for (const r of rows) {
        await tx.query(
          `INSERT INTO analytics.ai_quality_reports
             (tenant_id, report_date, category_id, suggestions, accuracy, calibration_error, override_rate,
              model_review_flag, completed_at)
           VALUES (app.tenant(), $1::date, $2::uuid, $3, $4, $5, $6, $7, now())
           ON CONFLICT (tenant_id, report_date, category_id) DO UPDATE SET
             suggestions = EXCLUDED.suggestions, accuracy = EXCLUDED.accuracy,
             calibration_error = EXCLUDED.calibration_error, override_rate = EXCLUDED.override_rate,
             model_review_flag = EXCLUDED.model_review_flag, completed_at = now()`,
          [day, r.categoryId, r.count, r.accuracy / 100, r.calibration / 100, r.overrideRate / 100, r.modelReviewFlag],
        );
      }
    });
  }
}
