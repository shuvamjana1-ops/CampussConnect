// Framework-neutral route table for the Ticket endpoints. The HTTP layer authenticates the request, builds the
// `TicketActor` from the session, reads the `Idempotency-Key` header and mounts these routes under `/tickets`.
// The response status for `POST /tickets` is the `status` of the result: 201 for a new Ticket, 200 for an existing one.

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import type { TicketCreationService } from './ticket-creation';
import {
  TicketPermissionError,
  TicketValidationError,
  type CreateTicketInput,
  type TicketActor,
} from './tickets.types';

export interface TicketRouteRequest {
  readonly actor: TicketActor;
  readonly params: Readonly<Record<string, string>>;
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface TicketRoute {
  readonly method: 'POST';
  /** Path relative to the mount point. */
  readonly path: string;
  /** Resolves to `{ status, body }`. */
  readonly handler: (request: TicketRouteRequest) => Promise<{ readonly status: number; readonly body: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Unknown body fields are rejected rather than ignored (`unknown_field`). */
const BODY_FIELDS = ['type', 'title', 'description', 'categoryId', 'confidential', 'profanityConfirmed'] as const;

function parseBody(body: unknown): CreateTicketInput {
  if (!isRecord(body)) throw new TicketValidationError([{ path: '', rule: 'type', expected: 'object' }]);
  const unknown = Object.keys(body)
    .filter((k) => !(BODY_FIELDS as readonly string[]).includes(k))
    .map((k): FieldError => ({ path: k, rule: 'unknown_field' }));
  if (unknown.length > 0) throw new TicketValidationError(unknown);
  return {
    type: body['type'] as CreateTicketInput['type'],
    title: body['title'] as string,
    description: body['description'] as string,
    categoryId: body['categoryId'] as string,
    confidential: (body['confidential'] ?? false) as boolean,
  };
}

export function ticketRoutes(service: TicketCreationService): readonly TicketRoute[] {
  return [
    {
      method: 'POST',
      path: '/',
      handler: async (r) => {
        const key = r.headers['idempotency-key'];
        if (key === undefined) {
          throw new TicketValidationError([{ path: 'Idempotency-Key', rule: 'required' }]);
        }
        const result = await service.create(r.actor, key, parseBody(r.body));
        return { status: result.status, body: result.receipt };
      },
    },
  ];
}

export interface TicketErrorMapping {
  readonly code: typeof ErrorCode.VALIDATION_FAILED | typeof ErrorCode.INSUFFICIENT_PERMISSION;
  readonly status: number;
  /** Present for `VALIDATION_FAILED`: every invalid field path with its rule and bounds. */
  readonly fields?: readonly FieldError[];
}

/** Maps a Ticket error to its error code and HTTP status, or `undefined` for errors that are not ours. */
export function toTicketProblem(error: unknown): TicketErrorMapping | undefined {
  if (error instanceof TicketValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof TicketPermissionError) {
    return { code: ErrorCode.INSUFFICIENT_PERMISSION, status: httpStatusOf(ErrorCode.INSUFFICIENT_PERMISSION) };
  }
  return undefined;
}
