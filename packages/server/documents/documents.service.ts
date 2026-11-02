// Document_Locker: quarantine-pipeline uploads, links without copying, checklist, soft delete (12.2-12.4, 12.8-12.10).

import { randomUUID } from 'node:crypto';
import { MAX_LINKS_PER_DOCUMENT, canLink, missingDocuments } from '@campusconnect/domain/applications';
import { useTenant, type OutboxDatabase, type OutboxSqlClient } from '../outbox/outbox.types';
import type { FilesService } from '../files/files.service';
import type { UploadUrlResult } from '../files/files.types';
import type { UploadCandidate } from '../files/upload-decision';
import {
  ApplicationNotFoundError,
  DocumentLinkLimitError,
  DocumentNotCleanError,
  DocumentNotFoundError,
  type DocumentsActor,
  type LinkedDocument,
  type LockerDocumentView,
} from './documents.types';

export const DELETED_DOCUMENT_PURGE_DAYS = 30;

/** Resolves a Student's own application and the document types its Opportunity requires. */
export interface ApplicationLookup {
  find(
    tx: OutboxSqlClient,
    actor: DocumentsActor,
    applicationId: string,
  ): Promise<{ readonly requiredDocuments: readonly string[] } | undefined>;
}

interface DocRow {
  id: string;
  doc_type: string;
  name: string;
  status: 'pending' | 'clean' | 'rejected';
  created_at: Date;
  linked_at?: Date;
}

const VISIBLE = `d.tenant_id = app.tenant() AND d.deleted_at IS NULL AND f.status <> 'rejected'`;

function view(r: DocRow): LockerDocumentView {
  return {
    id: r.id,
    docType: r.doc_type,
    name: r.name,
    scanStatus: r.status === 'clean' ? 'clean' : 'pending',
    createdAt: r.created_at.toISOString(),
  };
}

export class DocumentsService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly files: FilesService,
    private readonly applications: ApplicationLookup,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Issues a quarantine upload URL and records the document. A rejected candidate throws AttachmentRejectedError
   * from the files module before anything is stored (12.9, 12.10).
   */
  async requestUpload(
    actor: DocumentsActor,
    input: { docType: string; name: string },
    candidate: UploadCandidate,
  ): Promise<UploadUrlResult & { documentId: string }> {
    const result = await this.files.requestLockerUploadUrl(actor, candidate);
    const documentId = randomUUID();
    await this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      await tx.query(
        `INSERT INTO docs.documents (tenant_id, id, owner_id, file_id, doc_type, name)
         VALUES (app.tenant(), $1::uuid, $2::uuid, $3::uuid, $4, $5)`,
        [documentId, actor.userId, result.fileId, input.docType, input.name],
      );
    });
    return { ...result, documentId };
  }

  /** Documents not deleted and not rejected, newest first. */
  async list(actor: DocumentsActor): Promise<readonly LockerDocumentView[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      const r = await tx.query<DocRow>(
        `SELECT d.id::text, d.doc_type, d.name, f.status, d.created_at
         FROM docs.documents d JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
         WHERE ${VISIBLE} AND d.owner_id = $1::uuid ORDER BY d.created_at DESC`,
        [actor.userId],
      );
      return r.rows.map(view);
    });
  }

  /** Links a clean document to an application without copying it; at most 50 links per document (12.3). */
  async link(actor: DocumentsActor, applicationId: string, documentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      if ((await this.applications.find(tx, actor, applicationId)) === undefined) throw new ApplicationNotFoundError();
      // The row lock serialises concurrent links of the same document so the cap holds.
      const doc = await tx.query<{ status: string }>(
        `SELECT f.status FROM docs.documents d
         JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
         WHERE d.tenant_id = app.tenant() AND d.id = $1::uuid AND d.owner_id = $2::uuid
           AND d.deleted_at IS NULL AND f.status <> 'rejected'
         FOR UPDATE OF d`,
        [documentId, actor.userId],
      );
      if (doc.rows[0] === undefined) throw new DocumentNotFoundError();
      if (doc.rows[0].status !== 'clean') throw new DocumentNotCleanError();
      const existing = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM docs.document_links WHERE tenant_id = app.tenant() AND document_id = $1::uuid`,
        [documentId],
      );
      const already = await tx.query(
        `SELECT 1 FROM docs.document_links
         WHERE tenant_id = app.tenant() AND document_id = $1::uuid AND application_id = $2::uuid`,
        [documentId, applicationId],
      );
      if (already.rows.length > 0) return;
      if (!canLink(undefined, existing.rows[0]?.n ?? 0)) throw new DocumentLinkLimitError(MAX_LINKS_PER_DOCUMENT);
      await tx.query(
        `INSERT INTO docs.document_links (tenant_id, application_id, document_id)
         VALUES (app.tenant(), $1::uuid, $2::uuid)`,
        [applicationId, documentId],
      );
    });
  }

  async unlink(actor: DocumentsActor, applicationId: string, documentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      if ((await this.applications.find(tx, actor, applicationId)) === undefined) throw new ApplicationNotFoundError();
      await tx.query(
        `DELETE FROM docs.document_links
         WHERE tenant_id = app.tenant() AND application_id = $1::uuid AND document_id = $2::uuid`,
        [applicationId, documentId],
      );
    });
  }

  /** Visible documents linked to the application. */
  async linked(actor: DocumentsActor, applicationId: string): Promise<readonly LinkedDocument[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      if ((await this.applications.find(tx, actor, applicationId)) === undefined) throw new ApplicationNotFoundError();
      const r = await tx.query<DocRow>(
        `SELECT d.id::text, d.doc_type, d.name, f.status, d.created_at, l.created_at AS linked_at
         FROM docs.document_links l
         JOIN docs.documents d ON d.tenant_id = l.tenant_id AND d.id = l.document_id
         JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
         WHERE ${VISIBLE} AND l.application_id = $1::uuid AND d.owner_id = $2::uuid ORDER BY l.created_at`,
        [applicationId, actor.userId],
      );
      return r.rows.map((row) => ({ ...view(row), linkedAt: (row.linked_at ?? row.created_at).toISOString() }));
    });
  }

  /** Required document types of the application's Opportunity that have no clean document in the locker (12.4). */
  async missingChecklist(actor: DocumentsActor, applicationId: string): Promise<readonly string[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      const found = await this.applications.find(tx, actor, applicationId);
      if (found === undefined) throw new ApplicationNotFoundError();
      const r = await tx.query<DocRow>(
        `SELECT d.id::text, d.doc_type, d.name, f.status, d.created_at
         FROM docs.documents d JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
         WHERE ${VISIBLE} AND d.owner_id = $1::uuid`,
        [actor.userId],
      );
      return missingDocuments(
        found.requiredDocuments,
        r.rows.map((x) => ({ id: x.id, docType: x.doc_type, scanStatus: x.status })),
      );
    });
  }

  /** Soft delete: hidden at once, purged by the retention job 30 days later (12.8). Idempotent. */
  async delete(actor: DocumentsActor, documentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      const now = this.now();
      const purgeAfter = new Date(now.getTime() + DELETED_DOCUMENT_PURGE_DAYS * 86_400_000);
      const r = await tx.query(
        `UPDATE docs.documents SET deleted_at = $3::timestamptz, purge_after = $4::timestamptz
         WHERE tenant_id = app.tenant() AND id = $1::uuid AND owner_id = $2::uuid AND deleted_at IS NULL
         RETURNING id`,
        [documentId, actor.userId, now.toISOString(), purgeAfter.toISOString()],
      );
      if (r.rows.length === 0) {
        const exists = await tx.query(
          `SELECT 1 FROM docs.documents WHERE tenant_id = app.tenant() AND id = $1::uuid AND owner_id = $2::uuid`,
          [documentId, actor.userId],
        );
        if (exists.rows.length === 0) throw new DocumentNotFoundError();
      }
    });
  }
}
