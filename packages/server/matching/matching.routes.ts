// Framework-neutral route table for recommendations. The HTTP layer authenticates the Student and maps
// MatchNotFoundError to 404 NOT_FOUND and MatchFeedbackInvalidError to 422 VALIDATION_FAILED.

import type { MatchingService } from './matching.service';
import type { MatchActor } from './matching.types';

export interface MatchRouteRequest {
  readonly actor: MatchActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface MatchRoute {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly handler: (request: MatchRouteRequest) => Promise<unknown>;
}

export function matchRoutes(service: MatchingService): readonly MatchRoute[] {
  return [
    { method: 'GET', path: '/recommendations', handler: (r) => service.recommendations(r.actor) },
    {
      method: 'GET',
      path: '/recommendations/:opportunityId/eligibility',
      handler: (r) => service.eligibility(r.actor, r.params.opportunityId ?? ''),
    },
    {
      method: 'POST',
      path: '/recommendations/:opportunityId/feedback',
      handler: async (r) => {
        const value = (r.body as { feedback?: unknown } | undefined)?.feedback;
        await service.feedback(r.actor, r.params.opportunityId ?? '', value);
        return { ok: true };
      },
    },
  ];
}
