// Ports and types for the files module. AWS adapters (S3, KMS) implement the ports in the staff and API apps.

import type { AttachmentRejectionReason } from "@campusconnect/contracts";
import type { OutboxSqlClient } from "../outbox/outbox.types";
import type { UploadTarget } from "./upload-decision";

export interface PresignedPost {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface PresignPostRequest {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  /** Becomes the `content-length-range` condition, inclusive. */
  readonly minBytes: number;
  readonly maxBytes: number;
  readonly expiresInSeconds: number;
}

/** S3 operations the module needs. A thin adapter over `@aws-sdk/client-s3` implements it. */
export interface ObjectStore {
  presignPost(request: PresignPostRequest): Promise<PresignedPost>;
  /** First `length` bytes of the object (ranged GET). */
  readHead(bucket: string, key: string, length: number): Promise<Uint8Array>;
  /** Copies between buckets, encrypting the copy with the given KMS key (SSE-KMS). */
  copy(request: {
    fromBucket: string;
    fromKey: string;
    toBucket: string;
    toKey: string;
    kmsKeyArn: string;
  }): Promise<void>;
  /** Deletes the object and all its versions. */
  deleteObject(bucket: string, key: string): Promise<void>;
}

/** Resolves the Tenant's KMS key (22.3). */
export interface TenantKeyResolver {
  keyArn(tenantId: string): Promise<string>;
}

/** Tells the Student an attachment was rejected. Ticket text and other attachments are not involved. */
export interface AttachmentNotifier {
  attachmentRejected(notice: {
    tenantId: string;
    studentId: string;
    fileId: string;
    target: UploadTarget;
    ownerId: string;
    reason: AttachmentRejectionReason;
  }): Promise<void>;
}

/** Decides whether the Student may attach to the Ticket (own Ticket, enrolment active). */
export interface AttachmentAccessPolicy {
  canAttachToTicket(
    tx: OutboxSqlClient,
    actor: FilesActor,
    ticketId: string,
  ): Promise<boolean>;
}

export interface FilesActor {
  readonly tenantId: string;
  readonly userId: string;
}

export interface FilesBuckets {
  readonly quarantine: string;
  readonly clean: string;
}

export class AttachmentRejectedError extends Error {
  constructor(readonly reason: AttachmentRejectionReason) {
    super(`Attachment rejected: ${reason}`);
    this.name = "AttachmentRejectedError";
  }
}

export class AttachmentAccessError extends Error {
  constructor() {
    super("Ticket not accessible for attachments.");
    this.name = "AttachmentAccessError";
  }
}

export interface UploadUrlResult {
  readonly fileId: string;
  readonly upload: PresignedPost;
}
