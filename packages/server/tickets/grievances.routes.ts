// Framework-neutral routes for confidentiality and the Grievance Committee (task 15.8).
// `POST /grievances/{id}/reveals`, `GET /grievances/{id}/identity`, `GET /grievances/l3`,
// `POST /grievances/{id}/decision`.

import { ErrorCode, type FieldError } from '@campusconnect/contracts';
import type { GrievanceService } from './grievances';
import { GrievanceError, type DecisionInput, type RevealInput } from './grievances.types';
import type { TicketRouteRequest } from './tickets.routes';

export interface GrievanceRoute {
  readonly method: 'GET' | 'POST';
  /** Path relative to the `/grievances` mount point. */
  readonly path: string;
  readonly handler: (request: TicketRouteRequest) => Promise<{ readonly status: number; readonly body: unknown }>;
}

function record(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new GrievanceError(ErrorCode.VALIDATION_FAILED, [{ path: '', rule: 'type', expected: 'object' }]);
  }
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    const fields: FieldError[] = extra.map((k) => ({ path: k, rule: 'unknown_field' }));
    throw new GrievanceError(ErrorCode.VALIDATION_FAILED, fields);
  }
  return body as Record<string, unknown>;
}

export function grievanceRoutes(service: GrievanceService): readonly GrievanceRoute[] {
  return [
    // Registered before the `/:id/...` routes so `l3` is never read as an id.
    {
      method: 'GET',
      path: '/l3',
      handler: async (r) => ({ status: 200, body: { items: await service.listL3(r.actor) } }),
    },
    {
      method: 'POST',
      path: '/:id/reveals',
      handler: async (r) => {
        const b = record(r.body, ['handlerId', 'reason']);
        const result = await service.reveal(r.actor, r.params['id'] ?? '', b as unknown as RevealInput);
        return { status: 201, body: result };
      },
    },
    {
      method: 'GET',
      path: '/:id/identity',
      handler: async (r) => ({ status: 200, body: await service.getIdentity(r.actor, r.params['id'] ?? '') }),
    },
    {
      method: 'POST',
      path: '/:id/decision',
      handler: async (r) => {
        const b = record(r.body, ['rationale', 'decision']);
        const result = await service.recordDecision(r.actor, r.params['id'] ?? '', b as unknown as DecisionInput);
        return { status: 201, body: result };
      },
    },
  ];
}
