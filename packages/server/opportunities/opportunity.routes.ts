// Framework-neutral route table for Opportunity publication. The HTTP layer authenticates and builds the actor, and
// maps OpportunityValidationError to 422 VALIDATION_FAILED with `{ fields }` and OpportunityPermissionError to 403
// INSUFFICIENT_PERMISSION.

import { ErrorCode, httpStatusOf } from '@campusconnect/contracts';
import type { OpportunityService } from './opportunity.service';
import { OpportunityPermissionError, OpportunityValidationError, type OpportunityActor } from './opportunity.types';

export interface OpportunityRouteRequest {
  readonly actor: OpportunityActor;
  readonly body: unknown;
}

export interface OpportunityRoute {
  readonly method: 'POST';
  readonly path: string;
  readonly handler: (request: OpportunityRouteRequest) => Promise<unknown>;
}

export function opportunityRoutes(service: OpportunityService): readonly OpportunityRoute[] {
  return [{ method: 'POST', path: '/opportunities', handler: (r) => service.publish(r.actor, r.body) }];
}

export interface OpportunityErrorMapping {
  readonly code: typeof ErrorCode.VALIDATION_FAILED | typeof ErrorCode.INSUFFICIENT_PERMISSION;
  readonly status: number;
  readonly fields?: OpportunityValidationError['fields'];
}

export function toOpportunityProblem(error: unknown): OpportunityErrorMapping | undefined {
  if (error instanceof OpportunityValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof OpportunityPermissionError) {
    return { code: ErrorCode.INSUFFICIENT_PERMISSION, status: httpStatusOf(ErrorCode.INSUFFICIENT_PERMISSION) };
  }
  return undefined;
}
