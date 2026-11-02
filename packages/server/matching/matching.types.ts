// Types for the Match_Engine (requirements 11.1 to 11.4, 11.7, 11.8, 11.10).

import type { CriterionResult } from '@campusconnect/domain/eligibility';

export const MATCH_QUEUE = 'match';
/** Students paged per batch when an Opportunity is published (11.1). */
export const MATCH_BATCH_SIZE = 1000;
/** Upper bound on Opportunities scored for one Student in a single re-match. */
export const MATCH_STUDENT_OPPORTUNITY_LIMIT = 5000;

/** Platform settings for scoring (11.1, 11.7). */
export interface MatchSettings {
  /** Similarity floor: cosine at or below it scores 0. */
  readonly s0: number;
  /** Weight of Opportunities marked relevant. */
  readonly alpha: number;
  /** Weight of Opportunities marked not relevant. */
  readonly beta: number;
}

export const DEFAULT_MATCH_SETTINGS: MatchSettings = { s0: 0.2, alpha: 0.5, beta: 0.5 };

export const FEEDBACK_VALUES = ['relevant', 'not_relevant', 'hidden'] as const;
export type FeedbackValue = (typeof FEEDBACK_VALUES)[number];

export interface MatchActor {
  readonly tenantId: string;
  readonly userId: string;
}

export interface RecommendationView {
  readonly opportunityId: string;
  readonly title: string;
  readonly deadline: number;
  readonly score: number;
  readonly explanation: readonly string[];
  /** Criteria whose result is unknown, flagged for the Student (G10). */
  readonly flagged: readonly CriterionResult[];
}

export interface EligibilityChecklistView {
  readonly opportunityId: string;
  readonly result: 'met' | 'not_met' | 'unknown';
  readonly criteria: readonly CriterionResult[];
}

export class MatchNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor() {
    super('Opportunity not found.');
    this.name = 'MatchNotFoundError';
  }
}

export class MatchFeedbackInvalidError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor() {
    super(`Feedback must be one of ${FEEDBACK_VALUES.join(', ')}.`);
    this.name = 'MatchFeedbackInvalidError';
  }
}
