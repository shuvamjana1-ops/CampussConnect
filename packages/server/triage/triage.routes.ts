// Framework-neutral route table for the suggestion endpoint. The HTTP layer authenticates, builds the actor, and maps
// SuggestValidationError to 422 VALIDATION_FAILED.

import { ErrorCode, httpStatusOf } from '@campusconnect/contracts';
import { SuggestValidationError, type SuggestActor, type SuggestService } from './suggest.service';

export interface TriageRouteRequest {
  readonly actor: SuggestActor;
  readonly body: unknown;
}

export interface TriageRoute {
  readonly method: 'POST';
  readonly path: string;
  readonly handler: (request: TriageRouteRequest) => Promise<unknown>;
}

export function triageRoutes(service: SuggestService): readonly TriageRoute[] {
  return [
    {
      method: 'POST',
      path: '/triage/suggest',
      handler: (r) => {
        const text = (r.body as { text?: unknown } | null | undefined)?.text;
        if (typeof text !== 'string') throw new SuggestValidationError();
        return service.suggest(r.actor, text);
      },
    },
  ];
}

export function toTriageProblem(error: unknown): { code: typeof ErrorCode.VALIDATION_FAILED; status: number } | undefined {
  if (error instanceof SuggestValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED) };
  }
  return undefined;
}
