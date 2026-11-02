// @campusconnect/domain/audit: SHA-256 hash chain for audit log entries using RFC 8785 canonical JSON.

import { createHash } from 'crypto';
import { type TenantId, type UserId, type Instant } from '../types';

/**
 * An audit log entry before hashing. The entry itself carries no hash; the hash is computed by `chainHash`.
 * All text fields accept only pre-sanitised text and must have passed redaction or be system-generated ids.
 */
export interface AuditEntry {
  /** UUID of the entry. */
  readonly id: string;
  /** Tenant that owns this entry. */
  readonly tenantId: TenantId;
  /** User who triggered the event, or 'system' for automated actions. */
  readonly actor: UserId | 'system';
  /** Audit action code, e.g. 'auth.login', 'ticket.created', 'ticket.reassigned'. */
  readonly action: string;
  /** Resource type and id, e.g. 'ticket:abc123def'. */
  readonly target: string;
  /** Outcome: 'success' or 'failure'. */
  readonly outcome: 'success' | 'failure';
  /** Details as a JSON object. Only pre-validated safe values. */
  readonly details?: Record<string, unknown>;
  /** Timestamp in UTC milliseconds. */
  readonly timestampMs: Instant;
}

/**
 * An audit entry combined with its hash, as stored in the log.
 */
export interface HashedAuditEntry extends AuditEntry {
  /** SHA-256 hash of the canonical JSON representation of this entry and the previous entry's hash. */
  readonly hash: string;
}

/**
 * Serialize an entry to RFC 8785 canonical JSON (deterministic, sorted keys, normalized escaping).
 * This is the representation that is hashed.
 */
export function canonicalJson(entry: AuditEntry): string {
  return JSON.stringify(sortKeys(entry), (_, value) => {
    if (value === null) return null;
    if (typeof value !== 'object') return value;
    return sortKeys(value);
  });
}

/** Sort object keys recursively for canonical JSON. */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute the SHA-256 hash for an audit entry given the previous entry's hash.
 * The hash is computed over the canonical JSON of the entry followed by the previous hash.
 *
 * For the first entry in a chain, set `prevHash` to an empty string or a genesis hash.
 *
 * @param prevHash SHA-256 hex string of the preceding entry (empty for the first entry).
 * @param entry The audit entry to hash.
 * @returns The SHA-256 hex string of the entry and previous hash combined.
 */
export function chainHash(prevHash: string, entry: AuditEntry): string {
  const canonical = canonicalJson(entry);
  const combined = canonical + prevHash;
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Result of chain verification.
 */
export interface VerificationResult {
  /** True if all entries form a valid chain. */
  readonly isValid: boolean;
  /** If invalid, the id of the first entry that failed verification. Otherwise undefined. */
  readonly firstFailingEntryId?: string;
}

/**
 * Verify that all entries form a valid hash chain, where each entry's hash is consistent with
 * the preceding entry and the canonical JSON representation.
 *
 * @param entries Audit entries in order, each including its computed hash.
 * @param startPrevHash The hash of the entry immediately before the first entry in this list.
 *                      Use '' for the start of a chain or the hash returned by the previous batch.
 * @returns A result object with `isValid` and, if invalid, `firstFailingEntryId`.
 */
export function verifyChain(entries: readonly HashedAuditEntry[], startPrevHash: string): VerificationResult {
  let prevHash = startPrevHash;

  for (const entry of entries) {
    const expectedHash = chainHash(prevHash, entry);
    if (entry.hash !== expectedHash) {
      return {
        isValid: false,
        firstFailingEntryId: entry.id,
      };
    }
    prevHash = entry.hash;
  }

  return { isValid: true };
}

/**
 * Get the hash of the last entry in a chain, for use as `startPrevHash` in a subsequent `verifyChain` call.
 * Returns an empty string if the chain is empty.
 */
export function chainTail(entries: readonly HashedAuditEntry[]): string {
  return entries.length > 0 ? entries[entries.length - 1].hash : '';
}
