// @campusconnect/server/privacy: consent, data subject requests, retention and breach notification.

export { ConsentService, ConsentGuard } from './consent.service';
export { DsrService, type DsrRequest } from './dsr.service';
export {
  RetentionJob,
  RETENTION_JOB_CADENCE_MS,
  type RetentionSource,
} from './retention.job';
export { BreachService, type BreachDeclaration, type BreachResult } from './breach.service';
export {
  BREACH_NOTIFY_DEADLINE_MS,
  CONSENT_WITHDRAWAL_MAX_MS,
  DSR_DUE_DAYS,
  ConsentRequiredError,
  DsrNotFoundError,
  DsrStateError,
  type ConsentDecision,
  type ConsentPurpose,
  type ConsentRecord,
  type DsrKind,
  type DsrStatus,
  type PrivacyNotice,
  type PrivacyNotifier,
  type RetainedCategory,
  type SubjectDataProvider,
} from './privacy.types';
