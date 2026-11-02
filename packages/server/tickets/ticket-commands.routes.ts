// Framework-neutral routes for Ticket commands, messages and Student views (task 15.7).
// `POST /tickets/{id}/commands` (If-Match), `POST /tickets/{id}/messages`, `GET /tickets?scope=mine`, `GET /tickets/{id}`.

import { ErrorCode, type FieldError } from '@campusconnect/contracts';
import type { TicketCommandService } from './ticket-commands';
import {
  TicketCommandError,
  type PostMessageInput,
  type TicketCommandInput,
} from './ticket-commands.types';
import type { TicketRouteRequest } from './tickets.routes';

export interface TicketCommandRoute {
  readonly method: 'GET' | 'POST';
  /** Path relative to the `/tickets` mount point. */
  readonly path: string;
  readonly handler: (request: TicketRouteRequest & { readonly query?: Readonly<Record<string, string | undefined>> }) => Promise<{
    readonly status: number;
    readonly body: unknown;
  }>;
}

function record(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new TicketCommandError(ErrorCode.VALIDATION_FAILED, [{ path: '', rule: 'type', expected: 'object' }]);
  }
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    const fields: FieldError[] = extra.map((k) => ({ path: k, rule: 'unknown_field' }));
    throw new TicketCommandError(ErrorCode.VALIDATION_FAILED, fields);
  }
  return body as Record<string, unknown>;
}

/** `If-Match` carries the Ticket version, optionally quoted (`"3"` or `W/"3"`). */
function parseIfMatch(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^(?:W\/)?"?(\d+)"?$/u.exec(value.trim());
  return match === null ? undefined : Number(match[1]);
}

export function ticketCommandRoutes(service: TicketCommandService): readonly TicketCommandRoute[] {
  return [
    {
      method: 'POST',
      path: '/:id/commands',
      handler: async (r) => {
        const b = record(r.body, ['type', 'reason', 'assigneeId', 'rating', 'band', 'eta']);
        const result = await service.execute(
          r.actor,
          r.params['id'] ?? '',
          parseIfMatch(r.headers['if-match']),
          b as unknown as TicketCommandInput,
        );
        return { status: 200, body: result };
      },
    },
    {
      method: 'POST',
      path: '/:id/messages',
      handler: async (r) => {
        const b = record(r.body, ['visibility', 'body']);
        const result = await service.postMessage(r.actor, r.params['id'] ?? '', b as unknown as PostMessageInput);
        return { status: 201, body: result };
      },
    },
    {
      method: 'GET',
      path: '/',
      handler: async (r) => {
        const scope = r.query?.['scope'];
        if (scope !== 'mine') {
          throw new TicketCommandError(ErrorCode.VALIDATION_FAILED, [{ path: 'scope', rule: 'enum', allowed: ['mine'] }]);
        }
        const limit = r.query?.['limit'] === undefined ? undefined : Number(r.query['limit']);
        const offset = r.query?.['offset'] === undefined ? undefined : Number(r.query['offset']);
        const items = await service.listMine(r.actor, {
          ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
          ...(offset === undefined || Number.isNaN(offset) ? {} : { offset }),
        });
        return { status: 200, body: { items } };
      },
    },
    {
      method: 'GET',
      path: '/:id',
      handler: async (r) => ({ status: 200, body: await service.getTicket(r.actor, r.params['id'] ?? '') }),
    },
  ];
}
