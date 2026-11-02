// Framework-neutral route table for the Workbench endpoints (task 18.6). The HTTP layer authenticates, builds the
// `TicketActor` from the session and maps `WorkbenchError` with `toWorkbenchProblem`.

import { ErrorCode } from '@campusconnect/contracts';
import type { TicketActor } from '../tickets';
import type { BulkReassignService } from './bulk-reassign.service';
import type { CannedReplyService } from './canned-replies';
import type { SummaryService } from './summary.service';
import type { WorkbenchService } from './workbench.service';
import {
  WorkbenchError,
  type BulkReassignInput,
  type CannedReplyInput,
  type QueueLane,
  type TriageCorrectionInput,
} from './workbench.types';

export interface WorkbenchRouteRequest {
  readonly actor: TicketActor;
  readonly params: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface WorkbenchRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Full path under the API prefix. */
  readonly path: string;
  readonly handler: (request: WorkbenchRouteRequest) => Promise<{ readonly status: number; readonly body: unknown }>;
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new WorkbenchError(ErrorCode.VALIDATION_FAILED, [{ path: '', rule: 'type', expected: 'object' }]);
  }
  return body as Record<string, unknown>;
}

export function workbenchRoutes(
  workbench: WorkbenchService,
  canned: CannedReplyService,
  summaries: SummaryService,
  bulk: BulkReassignService,
): readonly WorkbenchRoute[] {
  return [
    {
      method: 'POST',
      path: '/tickets/bulk-reassign',
      handler: async (r) => ({
        status: 200,
        body: await bulk.reassign(r.actor, bodyObject(r.body) as unknown as BulkReassignInput),
      }),
    },
    {
      method: 'GET',
      path: '/workbench/queue',
      handler: async (r) => {
        const lane = r.query?.['lane'];
        const cursor = r.query?.['cursor'];
        const page = await workbench.queue(r.actor, {
          ...(lane === undefined ? {} : { lane: lane as QueueLane }),
          ...(cursor === undefined || cursor === '' ? {} : { cursor }),
        });
        return { status: 200, body: page };
      },
    },
    {
      method: 'POST',
      path: '/tickets/:id/triage/confirm',
      handler: async (r) => {
        const body = r.body === undefined || r.body === null ? {} : bodyObject(r.body);
        if (Object.keys(body).length > 0) {
          throw new WorkbenchError(
            ErrorCode.VALIDATION_FAILED,
            Object.keys(body).map((k) => ({ path: k, rule: 'unknown_field' })),
          );
        }
        return { status: 200, body: await workbench.confirm(r.actor, r.params['id'] ?? '') };
      },
    },
    {
      method: 'POST',
      path: '/tickets/:id/triage/correct',
      handler: async (r) => ({
        status: 200,
        body: await workbench.correct(r.actor, r.params['id'] ?? '', bodyObject(r.body) as TriageCorrectionInput),
      }),
    },
    {
      method: 'GET',
      path: '/workbench/override-rate',
      handler: async (r) => ({ status: 200, body: { items: await workbench.overrideRate(r.actor) } }),
    },
    {
      method: 'GET',
      path: '/tickets/:id/summary',
      handler: async (r) => ({ status: 200, body: await summaries.summarise(r.actor, r.params['id'] ?? '') }),
    },
    {
      method: 'GET',
      path: '/workbench/canned-replies',
      handler: async (r) => ({ status: 200, body: { items: await canned.list(r.actor) } }),
    },
    {
      method: 'POST',
      path: '/workbench/canned-replies',
      handler: async (r) => ({
        status: 201,
        body: await canned.create(r.actor, bodyObject(r.body) as unknown as CannedReplyInput),
      }),
    },
    {
      method: 'PUT',
      path: '/workbench/canned-replies/:id',
      handler: async (r) => ({
        status: 200,
        body: await canned.update(r.actor, r.params['id'] ?? '', bodyObject(r.body) as unknown as CannedReplyInput),
      }),
    },
    {
      method: 'DELETE',
      path: '/workbench/canned-replies/:id',
      handler: async (r) => {
        await canned.remove(r.actor, r.params['id'] ?? '');
        return { status: 204, body: null };
      },
    },
  ];
}
