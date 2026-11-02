// Framework-neutral routes for the submission prechecks. The HTTP layer authenticates the Student, builds the
// `PrecheckActor` from the session, and mounts these under `/tickets` (before `/tickets/:id` routes).

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import {
  PrecheckTicketNotFoundError,
  PrecheckValidationError,
  ProfanityConfirmationRequiredError,
  type PrecheckActor,
  type PrecheckService,
} from './precheck.service';

export interface PrecheckRouteRequest {
  readonly actor: PrecheckActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface PrecheckRoute {
  readonly method: 'POST';
  /** Path relative to the mount point; `:name` marks a path parameter. */
  readonly path: string;
  readonly handler: (request: PrecheckRouteRequest) => Promise<unknown>;
}

export function precheckRoutes(service: PrecheckService): readonly PrecheckRoute[] {
  return [
    { method: 'POST', path: '/precheck', handler: (r) => service.precheck(r.actor, r.body) },
    { method: 'POST', path: '/:id/link', handler: (r) => service.link(r.actor, r.params['id'] ?? '', r.body) },
  ];
}

export interface PrecheckErrorMapping {
  readonly code:
    | typeof ErrorCode.VALIDATION_FAILED
    | typeof ErrorCode.PROFANITY_CONFIRMATION_REQUIRED
    | typeof ErrorCode.ACCESS_DENIED;
  readonly status: number;
  readonly fields?: readonly FieldError[];
}

/** Maps a precheck error to its error code and HTTP status, or `undefined` for errors that are not ours. */
export function toPrecheckProblem(error: unknown): PrecheckErrorMapping | undefined {
  if (error instanceof PrecheckValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof ProfanityConfirmationRequiredError) {
    return {
      code: ErrorCode.PROFANITY_CONFIRMATION_REQUIRED,
      status: httpStatusOf(ErrorCode.PROFANITY_CONFIRMATION_REQUIRED),
    };
  }
  if (error instanceof PrecheckTicketNotFoundError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  return undefined;
}
