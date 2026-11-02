// Recommendation list, eligibility checklist and feedback (requirements 11.3, 11.4, 11.7, 11.8).

import { candidacy, type CriterionResult } from '@campusconnect/domain/eligibility';
import { recommendationList } from '@campusconnect/domain/recommendations';
import type { ProfileDatabase } from '../opportunities/profile.types';
import { Matcher, profileOf, ruleOf } from './matcher';
import {
  DEFAULT_MATCH_SETTINGS,
  FEEDBACK_VALUES,
  MatchFeedbackInvalidError,
  MatchNotFoundError,
  type EligibilityChecklistView,
  type FeedbackValue,
  type MatchActor,
  type MatchSettings,
  type RecommendationView,
} from './matching.types';

export interface MatchingServiceOptions {
  readonly database: ProfileDatabase;
  readonly settings?: MatchSettings;
  readonly now?: () => number;
}

interface ListRow {
  id: string;
  title: string;
  deadline: Date | string;
  score: number;
  criteria: CriterionResult[];
  explanation: string[];
  hidden: boolean;
}

export class MatchingService {
  private readonly db: ProfileDatabase;
  private readonly matcher: Matcher;
  private readonly now: () => number;

  constructor(options: MatchingServiceOptions) {
    this.db = options.database;
    this.matcher = new Matcher(options.settings ?? DEFAULT_MATCH_SETTINGS);
    this.now = options.now ?? Date.now;
  }

  /** `GET /recommendations`. Hidden and expired Opportunities are excluded; ordered by score (11.5, 11.8). */
  async recommendations(actor: MatchActor): Promise<readonly RecommendationView[]> {
    const rows = await this.db.transaction({ tenantId: actor.tenantId }, async (tx) => {
      const r = await tx.query<ListRow>(
        `SELECT o.id::text AS id, o.title, o.deadline, m.score, m.criteria, m.explanation,
                COALESCE(f.feedback = 'hidden', false) AS hidden
           FROM opps.matches m
           JOIN opps.opportunities o ON o.tenant_id = m.tenant_id AND o.id = m.opportunity_id
           LEFT JOIN opps.match_feedback f
             ON f.tenant_id = m.tenant_id AND f.student_id = m.student_id AND f.opportunity_id = m.opportunity_id
          WHERE m.tenant_id = $1::uuid AND m.student_id = $2::uuid AND o.status = 'published'`,
        [actor.tenantId, actor.userId],
      );
      return r.rows;
    });
    const scored = rows.map((r) => ({
      id: r.id,
      score: r.score,
      hidden: r.hidden,
      expiresAt: new Date(r.deadline).getTime(),
      title: r.title,
      criteria: r.criteria,
      explanation: r.explanation,
    }));
    return recommendationList(scored, this.now()).map((r) => ({
      opportunityId: r.id,
      title: r.title,
      deadline: r.expiresAt,
      score: r.score,
      explanation: r.explanation,
      flagged: r.criteria.filter((c) => c.result === 'unknown'),
    }));
  }

  /** `GET /recommendations/:opportunityId/eligibility`. Each criterion is met, not met or unknown (11.4). */
  async eligibility(actor: MatchActor, opportunityId: string): Promise<EligibilityChecklistView> {
    return this.db.transaction({ tenantId: actor.tenantId }, async (tx) => {
      const o = await tx.query<{ eligibility_rules: unknown }>(
        `SELECT eligibility_rules FROM opps.opportunities WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [actor.tenantId, opportunityId],
      );
      if (o.rows[0] === undefined) throw new MatchNotFoundError();
      const p = await tx.query<{ fields: Record<string, { value?: never }> }>(
        `SELECT fields FROM opps.student_profiles WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [actor.tenantId, actor.userId],
      );
      const profile = profileOf(p.rows[0]?.fields ?? {});
      const c = candidacy(ruleOf(o.rows[0].eligibility_rules), profile);
      return { opportunityId, result: c.result, criteria: c.criteria };
    });
  }

  /**
   * `POST /recommendations/:opportunityId/feedback`. Records the feedback and re-matches the Student in the same
   * transaction, so the next ranking reflects it (11.7) and a hidden Opportunity leaves the list at once (11.8).
   */
  async feedback(actor: MatchActor, opportunityId: string, value: unknown): Promise<void> {
    if (typeof value !== 'string' || !(FEEDBACK_VALUES as readonly string[]).includes(value)) {
      throw new MatchFeedbackInvalidError();
    }
    const feedback = value as FeedbackValue;
    await this.db.transaction({ tenantId: actor.tenantId }, async (tx) => {
      const exists = await tx.query(
        `SELECT 1 FROM opps.opportunities WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [actor.tenantId, opportunityId],
      );
      if (exists.rows.length === 0) throw new MatchNotFoundError();
      await tx.query(
        `INSERT INTO opps.match_feedback (tenant_id, student_id, opportunity_id, feedback)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
         ON CONFLICT (tenant_id, student_id, opportunity_id)
         DO UPDATE SET feedback = EXCLUDED.feedback, updated_at = now()`,
        [actor.tenantId, actor.userId, opportunityId, feedback],
      );
      await this.matcher.matchStudent(tx, actor.tenantId, actor.userId);
    });
  }
}
