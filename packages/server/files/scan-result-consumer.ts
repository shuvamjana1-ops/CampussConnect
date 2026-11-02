// `files` consumer: GuardDuty Malware Protection results delivered through EventBridge (D11, 3.16, 12.9, 22.3).

import type { AttachmentRejectionReason } from '@campusconnect/contracts';
import { QueueConsumer, type DecodedMessage } from '../outbox/queue-consumer';
import type { OutboxDatabase, OutboxSqlClient, QueueClient } from '../outbox/outbox.types';
import type { QueueConsumerOptions } from '../outbox/queue-consumer';
import type { AttachmentNotifier, FilesBuckets, ObjectStore, TenantKeyResolver } from './files.types';
import { detectMime, SNIFF_BYTES } from './magic-bytes';
import { ALLOWED_TYPES, type UploadTarget } from './upload-decision';

export const FILES_QUEUE = 'files';

export type ScanStatus = 'NO_THREATS_FOUND' | 'THREATS_FOUND' | 'UNSUPPORTED' | 'ACCESS_DENIED' | 'FAILED';

export interface ScanResult {
  readonly bucket: string;
  readonly key: string;
  readonly status: ScanStatus;
}

interface FileRow {
  id: string;
  target: UploadTarget;
  owner_id: string;
  student_id: string;
  declared_type: string;
  status: string;
}

export class ScanResultConsumer extends QueueConsumer<ScanResult> {
  readonly consumer = 'files.scan-result';
  readonly queue = FILES_QUEUE;

  constructor(
    db: OutboxDatabase,
    client: QueueClient,
    private readonly store: ObjectStore,
    private readonly buckets: FilesBuckets,
    private readonly keys: TenantKeyResolver,
    private readonly notifier: AttachmentNotifier,
    options: QueueConsumerOptions = {},
  ) {
    super(db, client, options);
  }

  /** The tenant is the first segment of the quarantine key, which this module chose when issuing the URL. */
  protected decode(body: string): DecodedMessage<ScanResult> {
    const event = JSON.parse(body) as {
      id: string;
      detail?: {
        s3ObjectDetails?: { bucketName?: string; objectKey?: string };
        scanResultDetails?: { scanResultStatus?: ScanStatus };
      };
    };
    const bucket = event.detail?.s3ObjectDetails?.bucketName;
    const key = event.detail?.s3ObjectDetails?.objectKey;
    const status = event.detail?.scanResultDetails?.scanResultStatus;
    const tenantId = key?.split('/')[0];
    if (!event.id || !bucket || !key || !status || !tenantId) throw new Error('Malformed GuardDuty scan result.');
    return { tenantId, eventId: event.id, value: { bucket, key, status } };
  }

  protected async apply(tx: OutboxSqlClient, scan: ScanResult, message: DecodedMessage<ScanResult>): Promise<void> {
    if (scan.bucket !== this.buckets.quarantine) return;
    const found = await tx.query<FileRow>(
      `SELECT id::text, target, owner_id::text, student_id::text, declared_type, status
       FROM core.file_objects WHERE tenant_id = $1::uuid AND quarantine_key = $2 FOR UPDATE`,
      [message.tenantId, scan.key],
    );
    const file = found.rows[0];
    if (file === undefined || file.status !== 'pending') return;

    if (scan.status === 'NO_THREATS_FOUND') {
      const head = await this.store.readHead(scan.bucket, scan.key, SNIFF_BYTES);
      const actual = detectMime(head);
      if (actual !== undefined && actual === file.declared_type && ALLOWED_TYPES[file.target].includes(actual)) {
        await this.promote(tx, message.tenantId, file, scan.key);
        return;
      }
      await this.reject(tx, message.tenantId, file, scan, 'TYPE_NOT_ALLOWED');
      return;
    }
    // THREATS_FOUND, and any scan that did not complete cleanly, is never promoted.
    await this.reject(tx, message.tenantId, file, scan, 'MALWARE_DETECTED');
  }

  private async promote(tx: OutboxSqlClient, tenantId: string, file: FileRow, quarantineKey: string): Promise<void> {
    const cleanKey = quarantineKey;
    await this.store.copy({
      fromBucket: this.buckets.quarantine,
      fromKey: quarantineKey,
      toBucket: this.buckets.clean,
      toKey: cleanKey,
      kmsKeyArn: await this.keys.keyArn(tenantId),
    });
    await tx.query(
      `UPDATE core.file_objects SET status = 'clean', clean_key = $3, resolved_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, file.id, cleanKey],
    );
    await this.store.deleteObject(this.buckets.quarantine, quarantineKey);
  }

  private async reject(
    tx: OutboxSqlClient,
    tenantId: string,
    file: FileRow,
    scan: ScanResult,
    reason: AttachmentRejectionReason,
  ): Promise<void> {
    await this.store.deleteObject(scan.bucket, scan.key);
    await tx.query(
      `UPDATE core.file_objects SET status = 'rejected', rejection_reason = $3, resolved_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, file.id, reason],
    );
    await this.notifier.attachmentRejected({
      tenantId,
      studentId: file.student_id,
      fileId: file.id,
      target: file.target,
      ownerId: file.owner_id,
      reason,
    });
  }
}
