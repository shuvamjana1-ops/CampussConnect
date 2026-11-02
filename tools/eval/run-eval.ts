// Runs a Tenant evaluation set through the triage pipeline (redact, classify, score, decide) (5.8, 25.3).
import type { AiAdapter } from '@campusconnect/ai-adapter';
import { decideTriage } from '@campusconnect/domain/triage';
import type { RoutingRule, TriageBand, TriageCategory } from '@campusconnect/domain/triage';
import type { PiiRedactor } from '@campusconnect/pii-redactor';
import { buildReport, type EvalOutcome, type EvalReport } from './metrics';

export interface EvalCase {
  readonly id: string;
  readonly text: string;
  readonly expectedBand: TriageBand;
  readonly expectedCategoryId?: string;
}

export interface EvalSet {
  readonly tenantId: string;
  readonly categories: readonly (TriageCategory & { readonly description?: string })[];
  readonly departmentIds: readonly string[];
  readonly routingRules: readonly RoutingRule[];
  readonly defaultDepartmentId: string;
  readonly threshold: number;
  readonly cases: readonly EvalCase[];
}

export interface RunEvalOptions {
  readonly adapter: AiAdapter;
  readonly redactor: PiiRedactor;
  readonly timeoutMs?: number;
}

export async function runEval(set: EvalSet, opts: RunEvalOptions): Promise<EvalReport> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const outcomes: EvalOutcome[] = [];

  for (const c of set.cases) {
    const redacted = await opts.redactor.redact(c.text, { tenantId: set.tenantId });
    const text = redacted.text;

    const cat = await opts.adapter.classify(
      {
        purpose: 'triage',
        text,
        labels: set.categories.map((x) => ({ id: x.id, description: x.description ?? x.id })),
      },
      { timeoutMs },
    );
    const dept = await opts.adapter.classify(
      {
        purpose: 'triage',
        text,
        labels: set.departmentIds.map((id) => ({ id, description: id })),
      },
      { timeoutMs },
    );
    const prio = await opts.adapter.scorePriority({ text }, { timeoutMs });

    // Any adapter failure follows the production fallback path (rules only).
    const ai =
      cat.type === 'success'
        ? {
            categoryScores: cat.data.scores.map((s) => ({ label: s.id, score: s.confidence })),
            departmentScores:
              dept.type === 'success' ? dept.data.scores.map((s) => ({ label: s.id, score: s.confidence })) : [],
            ...(prio.type === 'success' ? { band: prio.data.band, safetyRisk: prio.data.safetyRisk } : {}),
          }
        : null;

    const decision = decideTriage({
      ai,
      text: c.text,
      categories: set.categories,
      departmentIds: set.departmentIds,
      routingRules: set.routingRules,
      defaultDepartmentId: set.defaultDepartmentId,
      threshold: set.threshold,
    });

    outcomes.push({
      expectedBand: c.expectedBand,
      decidedBand: decision.band,
      confidence: decision.categoryConfidence,
      categoryCorrect: c.expectedCategoryId === undefined || decision.categoryId === c.expectedCategoryId,
    });
  }

  return buildReport(outcomes);
}
