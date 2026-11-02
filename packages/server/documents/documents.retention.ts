// Retention and erasure for Locker documents (12.8, 19.4, 19.5): purge of soft-deleted documents and eraseSubject.

import type { RetentionItem } from '@campusconnect/domain/retention';
import { DOCUMENT_TYPE } from '@campusconnect/domain/retention';
import type { OutboxSqlClient } from '../outbox/outbox.types';
import type { RetentionSource } from '../privacy/retention.job';
import type { RetainedCategory, SubjectDataProvider } from '../privacy/privacy.types';
import type { FilesBuckets, ObjectStore } from '../files/files.types';

interface PurgeRow {
  id: string;
  file_id: string;
  quarantine_key: string;
  clean_key: string | null;
}

async function removeDocuments(
  tx: OutboxSqlClient,
  store: ObjectStore,
  buckets: FilesBuckets,
  rows: readonly PurgeRow[],
  tenantId: string,
): Promise<void> {
  for (const row of rows) {
    await store.deleteObject(buckets.quarantine, row.quarantine_key);
    if (row.clean_key !== null) await store.deleteObject(buckets.clean, row.clean_key);
  }
  if (rows.length === 0) return;
  await tx.query(`DELETE FROM docs.documents WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`, [
    tenantId,
    rows.map((r) => r.id),
  ]);
  await tx.query(`DELETE FROM core.file_objects WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`, [
    tenantId,
    rows.map((r) => r.file_id),
  ]);
}

/** Registered with the RetentionJob: deleted documents expire at deleted_at + 30 days (purge_after). */
export class DocumentRetentionSource implements RetentionSource {
  readonly itemType = DOCUMENT_TYPE;

  constructor(
    private readonly store: ObjectStore,
    private readonly buckets: FilesBuckets,
  ) {}

  async list(tx: OutboxSqlClient, tenantId: string): Promise<readonly RetentionItem[]> {
    const r = await tx.query<{ id: string; created_at: Date; deleted_at: Date | null; purge_after: Date | null }>(
      `SELECT d.id::text, d.created_at, COALESCE(d.deleted_at, f.resolved_at) AS deleted_at,
              COALESCE(d.purge_after, f.resolved_at + interval '30 days') AS purge_after
       FROM docs.documents d JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
       WHERE d.tenant_id = $1::uuid AND (d.deleted_at IS NOT NULL OR f.status = 'rejected')`,
      [tenantId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      type: DOCUMENT_TYPE,
      createdAt: x.created_at,
      deletedAt: x.deleted_at,
      expiresAt: x.purge_after,
    }));
  }

  async dispose(tx: OutboxSqlClient, tenantId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const r = await tx.query<PurgeRow>(
      `SELECT d.id::text, d.file_id::text, f.quarantine_key, f.clean_key
       FROM docs.documents d JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
       WHERE d.tenant_id = $1::uuid AND d.id = ANY($2::uuid[])`,
      [tenantId, ids],
    );
    await removeDocuments(tx, this.store, this.buckets, r.rows, tenantId);
  }
}

/** DSR provider: the Student's documents, links and stored objects are deleted entirely (19.4). */
export class DocumentSubjectDataProvider implements SubjectDataProvider {
  readonly category = 'documents';

  constructor(
    private readonly store: ObjectStore,
    private readonly buckets: FilesBuckets,
  ) {}

  async exportSubjectData(tx: OutboxSqlClient, tenantId: string, userId: string): Promise<unknown> {
    const r = await tx.query(
      `SELECT d.id::text, d.doc_type, d.name, d.created_at, d.deleted_at
       FROM docs.documents d WHERE d.tenant_id = $1::uuid AND d.owner_id = $2::uuid ORDER BY d.created_at`,
      [tenantId, userId],
    );
    return r.rows;
  }

  async eraseSubject(tx: OutboxSqlClient, tenantId: string, userId: string): Promise<readonly RetainedCategory[]> {
    const r = await tx.query<PurgeRow>(
      `SELECT d.id::text, d.file_id::text, f.quarantine_key, f.clean_key
       FROM docs.documents d JOIN core.file_objects f ON f.tenant_id = d.tenant_id AND f.id = d.file_id
       WHERE d.tenant_id = $1::uuid AND d.owner_id = $2::uuid`,
      [tenantId, userId],
    );
    await removeDocuments(tx, this.store, this.buckets, r.rows, tenantId);
    return [];
  }
}
