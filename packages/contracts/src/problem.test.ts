import { describe, expect, it } from 'vitest';

import { ERROR_CODES, type ErrorCode, httpStatusOf } from './error-codes';
import { problem, validationProblem } from './problem';

/** HTTP status of each code, copied from the design's error code table. */
const DESIGN_STATUS: Record<ErrorCode, number> = {
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  INSUFFICIENT_PERMISSION: 403,
  ACCOUNT_LOCKED: 423,
  SSO_UNAVAILABLE: 503,
  ACCOUNT_NOT_IN_RECORDS: 403,
  MFA_REQUIRED: 401,
  MFA_FAILED: 401,
  VALIDATION_FAILED: 422,
  PROFANITY_CONFIRMATION_REQUIRED: 422,
  ATTACHMENT_REJECTED: 422,
  TICKET_CLOSED: 409,
  CONFIRMATION_WINDOW_ENDED: 409,
  INVALID_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  BULK_REASSIGN_FAILED: 409,
  ETA_REQUIRED: 409,
  ERP_FIELD_READ_ONLY: 409,
  CONSENT_REQUIRED: 403,
  DOCUMENT_LINK_LIMIT: 409,
  BROADCAST_NOT_APPROVED: 409,
  AUDIT_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  DEPENDENCY_DEGRADED: 503,
  SEARCH_TIMEOUT: 504,
};

describe('error codes', () => {
  it('contains exactly the codes from the design, each with its HTTP status', () => {
    expect(ERROR_CODES.toSorted()).toEqual(Object.keys(DESIGN_STATUS).toSorted());
    for (const code of ERROR_CODES) {
      expect(httpStatusOf(code)).toBe(DESIGN_STATUS[code]);
    }
  });
});

describe('problem details', () => {
  it('builds the VALIDATION_FAILED problem in the shape of the design example', () => {
    const fields = [{ path: 'reason', rule: 'length', min: 1, max: 500 }] as const;
    expect(validationProblem(fields, '01JREQUEST')).toEqual({
      type: 'https://campusconnect.app/errors/VALIDATION_FAILED',
      title: 'Validation failed',
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'reason', rule: 'length', min: 1, max: 500 }],
      requestId: '01JREQUEST',
    });
  });

  it('adds the extension members of a code and nothing else', () => {
    expect(problem('RATE_LIMITED', { requestId: 'r1', retryAfterSeconds: 12 })).toEqual({
      type: 'https://campusconnect.app/errors/RATE_LIMITED',
      title: 'Rate limit exceeded',
      status: 429,
      code: 'RATE_LIMITED',
      requestId: 'r1',
      retryAfterSeconds: 12,
    });
    expect(problem('TICKET_CLOSED', { requestId: 'r2' })).toEqual({
      type: 'https://campusconnect.app/errors/TICKET_CLOSED',
      title: 'Ticket is closed',
      status: 409,
      code: 'TICKET_CLOSED',
      requestId: 'r2',
    });
  });
});
