// Types for Opportunity publication and expiry (requirements 10.10 to 10.14).

import type { FieldError } from '@campusconnect/contracts';
import type { Principal } from '@campusconnect/domain/rbac';

export interface OpportunityActor {
  readonly principal: Principal;
}

export interface OpportunityRecord {
  readonly id: string;
  readonly title: string;
  readonly deadline: number;
  readonly status: 'published';
}

/** Embedding call budget; a slow provider must not hold the worker. */
export const OPPORTUNITY_EMBED_TIMEOUT_MS = 10_000;
/** How often the expiry sweeper runs. Well inside the 5-minute bound of 10.13. */
export const OPPORTUNITY_EXPIRY_CADENCE_MS = 60_000;

/** The actor lacks the `opportunity.publish` grant. Maps to `403 INSUFFICIENT_PERMISSION` (10.12). */
export class OpportunityPermissionError extends Error {
  readonly code = 'INSUFFICIENT_PERMISSION' as const;
  constructor() {
    super('The actor cannot publish Opportunities.');
    this.name = 'OpportunityPermissionError';
  }
}

/** The submission is invalid. Lists every invalid field. Maps to `422 VALIDATION_FAILED` (10.11). */
export class OpportunityValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(readonly fields: readonly FieldError[]) {
    super('The Opportunity is invalid.');
    this.name = 'OpportunityValidationError';
  }
}
