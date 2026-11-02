// Shared accept/reject rule for Ticket attachments and Document_Locker uploads (3.14, 3.15, 12.9, 12.10).

import { ATTACHMENT_MAX_BYTES, TICKET_ATTACHMENT_LIMIT, type AttachmentRejectionReason } from '@campusconnect/contracts';

export type UploadTarget = 'ticket' | 'document_locker';

export const ALLOWED_TYPES: Readonly<Record<UploadTarget, readonly string[]>> = {
  ticket: ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'],
  document_locker: ['application/pdf', 'image/jpeg', 'image/png'],
};

/** An attachment already accepted or still pending a scan. */
export interface ExistingUpload {
  readonly status: 'pending' | 'clean' | 'rejected';
}

export interface UploadCandidate {
  readonly type: string;
  readonly sizeBytes: number;
}

export type UploadDecision =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: AttachmentRejectionReason };

/**
 * Pure rule. Size 1 byte to 10 MB; type in the target's list; a Ticket holds at most 5 accepted or pending
 * attachments, so rejected ones do not count. Document_Locker has no per-upload count limit here.
 */
export function uploadDecision(
  existing: readonly ExistingUpload[],
  candidate: UploadCandidate,
  target: UploadTarget,
): UploadDecision {
  if (!ALLOWED_TYPES[target].includes(candidate.type)) return { accepted: false, reason: 'TYPE_NOT_ALLOWED' };
  if (!Number.isInteger(candidate.sizeBytes) || candidate.sizeBytes < 1 || candidate.sizeBytes > ATTACHMENT_MAX_BYTES) {
    return { accepted: false, reason: 'TOO_LARGE' };
  }
  if (target === 'ticket' && existing.filter((e) => e.status !== 'rejected').length >= TICKET_ATTACHMENT_LIMIT) {
    return { accepted: false, reason: 'LIMIT_REACHED' };
  }
  return { accepted: true };
}
