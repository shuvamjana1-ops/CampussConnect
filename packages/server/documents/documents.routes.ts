// Framework-neutral route table for the Document_Locker. The HTTP layer authenticates the Student, builds the actor,
// and maps errors with toDocumentProblem (409 DOCUMENT_LINK_LIMIT, 403 for unknown or foreign ids, 409 for unscanned documents).

import { ErrorCode, httpStatusOf } from '@campusconnect/contracts';
import type { DocumentsService } from './documents.service';
import {
  ApplicationNotFoundError,
  DocumentLinkLimitError,
  DocumentNotCleanError,
  DocumentNotFoundError,
  type DocumentsActor,
} from './documents.types';

export interface DocumentRouteRequest {
  readonly actor: DocumentsActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body?: { docType?: string; name?: string; type?: string; sizeBytes?: number };
}

export interface DocumentRoute {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly handler: (request: DocumentRouteRequest) => Promise<unknown>;
}

export function documentRoutes(service: DocumentsService): readonly DocumentRoute[] {
  return [
    { method: 'GET', path: '/documents', handler: (r) => service.list(r.actor) },
    {
      method: 'POST',
      path: '/documents/upload-url',
      handler: (r) =>
        service.requestUpload(
          r.actor,
          { docType: r.body?.docType ?? '', name: r.body?.name ?? '' },
          { type: r.body?.type ?? '', sizeBytes: r.body?.sizeBytes ?? 0 },
        ),
    },
    { method: 'DELETE', path: '/documents/{id}', handler: (r) => service.delete(r.actor, r.params.id ?? '') },
    {
      method: 'POST',
      path: '/applications/{id}/documents/{documentId}',
      handler: (r) => service.link(r.actor, r.params.id ?? '', r.params.documentId ?? ''),
    },
    {
      method: 'DELETE',
      path: '/applications/{id}/documents/{documentId}',
      handler: (r) => service.unlink(r.actor, r.params.id ?? '', r.params.documentId ?? ''),
    },
    { method: 'GET', path: '/applications/{id}/documents', handler: (r) => service.linked(r.actor, r.params.id ?? '') },
    {
      method: 'GET',
      path: '/applications/{id}/documents/missing',
      handler: async (r) => ({ missing: await service.missingChecklist(r.actor, r.params.id ?? '') }),
    },
  ];
}

export interface DocumentErrorMapping {
  readonly code: string;
  readonly status: number;
}

export function toDocumentProblem(error: unknown): DocumentErrorMapping | undefined {
  if (error instanceof DocumentLinkLimitError) {
    return { code: ErrorCode.DOCUMENT_LINK_LIMIT, status: httpStatusOf(ErrorCode.DOCUMENT_LINK_LIMIT) };
  }
  if (error instanceof DocumentNotFoundError || error instanceof ApplicationNotFoundError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  if (error instanceof DocumentNotCleanError) {
    return { code: ErrorCode.INVALID_TRANSITION, status: httpStatusOf(ErrorCode.INVALID_TRANSITION) };
  }
  return undefined;
}
