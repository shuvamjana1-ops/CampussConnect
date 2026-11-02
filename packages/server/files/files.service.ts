// Upload URL issuing for Ticket attachments and Document_Locker uploads (3.14-3.16, 12.9, 12.10).

import { randomUUID } from 'node:crypto';
import { ATTACHMENT_MAX_BYTES } from '@campusconnect/contracts';
import { useTenant, type OutboxDatabase } from '../outbox/outbox.types';
import {
  AttachmentAccessError,
  AttachmentRejectedError,
  type AttachmentAccessPolicy,
  type FilesActor,
  type FilesBuckets,
  type ObjectStore,
  type UploadUrlResult,
} from './files.types';
import { uploadDecision, type UploadCandidate, type UploadTarget } from './upload-decision';

const URL_TTL_SECONDS = 300;

export class FilesService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly store: ObjectStore,
    private readonly buckets: FilesBuckets,
    private readonly access: AttachmentAccessPolicy,
  ) {}

  /** `POST /tickets/{id}/attachments/upload-url`. Throws AttachmentRejectedError or AttachmentAccessError. */
  async requestTicketUploadUrl(actor: FilesActor, ticketId: string, candidate: UploadCandidate): Promise<UploadUrlResult> {
    return this.issue(actor, 'ticket', ticketId, candidate);
  }

  /** Document_Locker upload URL; the owner is the Student. */
  async requestLockerUploadUrl(actor: FilesActor, candidate: UploadCandidate): Promise<UploadUrlResult> {
    return this.issue(actor, 'document_locker', actor.userId, candidate);
  }

  private async issue(actor: FilesActor, target: UploadTarget, ownerId: string, candidate: UploadCandidate): Promise<UploadUrlResult> {
    const { fileId, key } = await this.db.transaction(async (tx) => {
      await useTenant(tx, actor.tenantId);
      if (target === 'ticket' && !(await this.access.canAttachToTicket(tx, actor, ownerId))) throw new AttachmentAccessError();
      // Serialise concurrent requests for the same owner so the 5-attachment limit holds.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${target}:${ownerId}`]);
      const existing = await tx.query<{ status: 'pending' | 'clean' | 'rejected' }>(
        `SELECT status FROM core.file_objects
         WHERE tenant_id = $1::uuid AND target = $2 AND owner_id = $3::uuid`,
        [actor.tenantId, target, ownerId],
      );
      const decision = uploadDecision(existing.rows, candidate, target);
      if (!decision.accepted) throw new AttachmentRejectedError(decision.reason);
      const id = randomUUID();
      const objectKey = `${actor.tenantId}/${target}/${ownerId}/${id}`;
      await tx.query(
        `INSERT INTO core.file_objects (tenant_id, id, target, owner_id, student_id, declared_type, declared_size, quarantine_key)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8)`,
        [actor.tenantId, id, target, ownerId, actor.userId, candidate.type, candidate.sizeBytes, objectKey],
      );
      return { fileId: id, key: objectKey };
    });
    const upload = await this.store.presignPost({
      bucket: this.buckets.quarantine,
      key,
      contentType: candidate.type,
      minBytes: 1,
      maxBytes: ATTACHMENT_MAX_BYTES,
      expiresInSeconds: URL_TTL_SECONDS,
    });
    return { fileId, upload };
  }
}
