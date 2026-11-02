// @campusconnect/domain/audit: canonical JSON for audit entries and the per-Tenant hash chain.
export {
  type AuditEntry,
  type HashedAuditEntry,
  type VerificationResult,
  chainHash,
  chainTail,
  canonicalJson,
  verifyChain,
} from './chain';
