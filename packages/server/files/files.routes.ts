// Framework-neutral route table for attachment upload URLs. The HTTP layer authenticates, builds the actor, and maps
// AttachmentRejectedError to 422 ATTACHMENT_REJECTED with `{ reason }` and AttachmentAccessError to 403 ACCESS_DENIED.

import { ErrorCode, httpStatusOf } from '@campusconnect/contracts';
import type { FilesService } from './files.service';
import type { UploadCandidate } from './upload-decision';
import { AttachmentAccessError, AttachmentRejectedError, type FilesActor } from './files.types';

export interface FilesRouteRequest {
  readonly actor: FilesActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface FilesRoute {
  readonly method: 'POST';
  readonly path: string;
  readonly handler: (request: FilesRouteRequest) => Promise<unknown>;
}

/** Declared size and type are validated for shape only; `uploadDecision` produces the rejection reasons. */
const uploadRequestSchema = {
  parse(body: unknown): UploadCandidate {
    const b = (body ?? {}) as { type?: unknown; sizeBytes?: unknown };
    if (typeof b.type !== 'string' || typeof b.sizeBytes !== 'number') throw new TypeError('type and sizeBytes are required.');
    return { type: b.type, sizeBytes: b.sizeBytes };
  },
};

export function filesRoutes(service: FilesService): readonly FilesRoute[] {
  return [
    {
      method: 'POST',
      path: '/tickets/:id/attachments/upload-url',
      handler: (r) => service.requestTicketUploadUrl(r.actor, r.params['id'] ?? '', uploadRequestSchema.parse(r.body)),
    },
    {
      method: 'POST',
      path: '/document-locker/upload-url',
      handler: (r) => service.requestLockerUploadUrl(r.actor, uploadRequestSchema.parse(r.body)),
    },
  ];
}

export interface FilesErrorMapping {
  readonly code: typeof ErrorCode.ATTACHMENT_REJECTED | typeof ErrorCode.ACCESS_DENIED;
  readonly status: number;
  readonly reason?: AttachmentRejectedError['reason'];
}

export function toFilesProblem(error: unknown): FilesErrorMapping | undefined {
  if (error instanceof AttachmentRejectedError) {
    return { code: ErrorCode.ATTACHMENT_REJECTED, status: httpStatusOf(ErrorCode.ATTACHMENT_REJECTED), reason: error.reason };
  }
  if (error instanceof AttachmentAccessError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  return undefined;
}
