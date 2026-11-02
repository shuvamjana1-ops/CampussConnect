/** Error codes from the design's Error Handling section. Every API error carries exactly one of these codes. */
export const ErrorCode = {
  /** No valid session, or the Tenant cannot be resolved (1.3). */
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  /** Resource not visible to the caller; same response for nonexistent and other-Tenant ids (1.4, 8.7). */
  ACCESS_DENIED: 'ACCESS_DENIED',
  /** Role or scope does not allow the action (2.5, 10.12, 13.8). */
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  /** Lockout active; the problem includes the unlock time (2.9). */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** SSO_Provider unavailable or slower than 10 seconds (2.10). */
  SSO_UNAVAILABLE: 'SSO_UNAVAILABLE',
  /** No ERP record on first sign-in (17.4). */
  ACCOUNT_NOT_IN_RECORDS: 'ACCOUNT_NOT_IN_RECORDS',
  /** Staff MFA challenge needed (2.3). */
  MFA_REQUIRED: 'MFA_REQUIRED',
  /** Staff MFA challenge failed (2.3). */
  MFA_FAILED: 'MFA_FAILED',
  /** One or more fields out of bounds; the problem lists every invalid field (1.6, 22.4). */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** The Student must confirm flagged text (3.12). */
  PROFANITY_CONFIRMATION_REQUIRED: 'PROFANITY_CONFIRMATION_REQUIRED',
  /** Attachment rejected with a reason (3.15, 3.16, 12.10). */
  ATTACHMENT_REJECTED: 'ATTACHMENT_REJECTED',
  /** Change attempted on a Closed Ticket (4.13). */
  TICKET_CLOSED: 'TICKET_CLOSED',
  /** Dispute or confirmation after the 7-day window (4.11). */
  CONFIRMATION_WINDOW_ENDED: 'CONFIRMATION_WINDOW_ENDED',
  /** Command not allowed from the current status (4.1). */
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  /** `If-Match` version is stale; the client reloads. */
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  /** Bulk reassignment rejected; the problem lists each failing Ticket with its reason (7.9). */
  BULK_REASSIGN_FAILED: 'BULK_REASSIGN_FAILED',
  /** A Ticket at L1 has no Handler ETA yet (6.4). */
  ETA_REQUIRED: 'ETA_REQUIRED',
  /** Edit to an authoritative ERP field (10.4). */
  ERP_FIELD_READ_ONLY: 'ERP_FIELD_READ_ONLY',
  /** The feature needs a consent the user has not granted (19.1). */
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  /** Document already linked to 50 applications (12.3). */
  DOCUMENT_LINK_LIMIT: 'DOCUMENT_LINK_LIMIT',
  /** Broadcast send attempted before approval (13.9). */
  BROADCAST_NOT_APPROVED: 'BROADCAST_NOT_APPROVED',
  /** Audit record could not be written; the action was not performed (8.8, 18.9). */
  AUDIT_UNAVAILABLE: 'AUDIT_UNAVAILABLE',
  /** Rate limit exceeded; the problem includes `retryAfterSeconds` and the response a `Retry-After` header (22.8). */
  RATE_LIMITED: 'RATE_LIMITED',
  /**
   * A dependent function is unavailable (24.5). Where the core action continued, the API answers 200 with a
   * `degraded` field instead of a problem; the problem form (503) is used when it could not continue.
   */
  DEPENDENCY_DEGRADED: 'DEPENDENCY_DEGRADED',
  /** Audit search exceeded 30 seconds (18.6). */
  SEARCH_TIMEOUT: 'SEARCH_TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Every error code, in the order of the design's error code table. */
export const ERROR_CODES: readonly ErrorCode[] = Object.values(ErrorCode);

/** HTTP status and fixed English title of an error code. Titles never contain user text. */
export interface ErrorCodeInfo {
  readonly status: number;
  readonly title: string;
}

export const ERROR_CATALOGUE = {
  AUTHENTICATION_REQUIRED: { status: 401, title: 'Authentication required' },
  ACCESS_DENIED: { status: 403, title: 'Access denied' },
  INSUFFICIENT_PERMISSION: { status: 403, title: 'Insufficient permission' },
  ACCOUNT_LOCKED: { status: 423, title: 'Account locked' },
  SSO_UNAVAILABLE: { status: 503, title: 'Sign-in temporarily unavailable' },
  ACCOUNT_NOT_IN_RECORDS: { status: 403, title: 'Account not found in institution records' },
  MFA_REQUIRED: { status: 401, title: 'Multi-factor authentication required' },
  MFA_FAILED: { status: 401, title: 'Multi-factor authentication failed' },
  VALIDATION_FAILED: { status: 422, title: 'Validation failed' },
  PROFANITY_CONFIRMATION_REQUIRED: { status: 422, title: 'Text needs review before submission' },
  ATTACHMENT_REJECTED: { status: 422, title: 'Attachment rejected' },
  TICKET_CLOSED: { status: 409, title: 'Ticket is closed' },
  CONFIRMATION_WINDOW_ENDED: { status: 409, title: 'Confirmation window has ended' },
  INVALID_TRANSITION: { status: 409, title: 'Action not allowed in the current status' },
  VERSION_CONFLICT: { status: 409, title: 'Resource has changed since it was loaded' },
  BULK_REASSIGN_FAILED: { status: 409, title: 'Bulk reassignment failed' },
  ETA_REQUIRED: { status: 409, title: 'ETA required' },
  ERP_FIELD_READ_ONLY: { status: 409, title: 'Field is managed by the ERP' },
  CONSENT_REQUIRED: { status: 403, title: 'Consent required' },
  DOCUMENT_LINK_LIMIT: { status: 409, title: 'Document link limit reached' },
  BROADCAST_NOT_APPROVED: { status: 409, title: 'Broadcast not approved' },
  AUDIT_UNAVAILABLE: { status: 503, title: 'Audit record could not be written' },
  RATE_LIMITED: { status: 429, title: 'Rate limit exceeded' },
  DEPENDENCY_DEGRADED: { status: 503, title: 'Dependency unavailable' },
  SEARCH_TIMEOUT: { status: 504, title: 'Search timed out' },
} as const satisfies Record<ErrorCode, ErrorCodeInfo>;

/** HTTP status for an error code. */
export function httpStatusOf(code: ErrorCode): number {
  return ERROR_CATALOGUE[code].status;
}
