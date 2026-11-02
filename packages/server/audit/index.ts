// @campusconnect/server/audit: audit recording, hash chaining and anchoring.

export { AuditService } from './audit.service';
export { AuditChainer, type AuditChainerOptions, CHAIN_CADENCE_MS, ANCHOR_INTERVAL_MS } from './audit-chainer';
export {
  AuditAdminService,
  AuditRangeError,
  AuditSearchTimeoutError,
  MAX_SEARCH_RANGE_MS,
  SEARCH_TIMEOUT_MS,
  type AuditVerifyRequest,
  type AuditVerifyResult,
} from './audit-admin.service';
export { S3AnchorStore, type ObjectLockClient } from './s3-anchor-store';
export {
  AuditUnavailableError,
  auditCode,
  auditRef,
  type AnchorStore,
  type AnchoredChainHead,
  type AuditCode,
  type AuditDatabase,
  type AuditDetailValue,
  type AuditLogRow,
  type AuditRecordInput,
  type AuditRef,
  type AuditSearchOptions,
  type AuditSqlClient,
  type ChainHead,
} from './audit.types';
