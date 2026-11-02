// Framework-neutral routes for applications. The HTTP layer maps ApplicationValidationError to 422
// VALIDATION_FAILED with the allowed values and ApplicationNotFoundError to 404.

import type { ApplicationService } from './application.service';
import type { OpportunityActor } from './opportunity.types';

export interface ApplicationRouteRequest {
  readonly actor: OpportunityActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface ApplicationRoute {
  readonly method: 'POST' | 'PUT';
  readonly path: string;
  readonly handler: (request: ApplicationRouteRequest) => Promise<unknown>;
}

const field = (body: unknown, name: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined;

export function applicationRoutes(service: ApplicationService): readonly ApplicationRoute[] {
  return [
    {
      method: 'POST',
      path: '/applications',
      handler: (r) => service.save(r.actor, String(field(r.body, 'opportunityId') ?? '')),
    },
    {
      method: 'PUT',
      path: '/applications/:id/state',
      handler: (r) => service.changeState(r.actor, r.params['id'] ?? '', field(r.body, 'state')),
    },
    {
      method: 'PUT',
      path: '/applications/:id/outcome',
      handler: (r) => service.changeOutcome(r.actor, r.params['id'] ?? '', field(r.body, 'outcome')),
    },
  ];
}
