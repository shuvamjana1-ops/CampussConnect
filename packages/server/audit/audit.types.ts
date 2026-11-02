// Types for audit recording, chaining and anchoring.

import type { RedactedText } from '@campusconnect/pii-redactor';
import type { Brand, Instant, TenantId, UserId } from '@campusconnect/domain/types';

/** Minimal SQL surface the audit module needs. Both `pg` clients and the transaction handed out by `withTenant` can be adapted to it. */
export interface AuditSqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** A database that can open a transaction. */
export interface AuditDatabase {
  transaction<T>(fn: (tx: AuditSqlClient) => Promise<T>): Promise<T>;
}

/** A short machine code such as `ticket.reassigned` or `ADMIN`. Never free text. */
export type AuditCode = Brand<string, 'AuditCode'>;
/** An opaque identifier (UUID or similar). Never free text. */
export type AuditRef = Brand<string, 'AuditRef'>;

const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function auditCode(value: string): AuditCode {
  if (!CODE.test(value)) throw new RangeError('Audit code must be 1 to 64 characters of letters, digits and _ . : -.');
  return value as AuditCode;
}

export function auditRef(value: string): AuditRef {
  if (!REF.test(value)) throw new RangeError('Audit ref must be 1 to 64 characters of letters, digits, _ and -.');
  return value as AuditRef;
}

/** Only ids, codes and redacted text may appear in audit details (G4, requirement 18.8). */
export type AuditDetailValue = AuditCode | AuditRef | RedactedText;

export interface AuditRecordInput {
  /** The user who acted, or `system`. */
  readonly actor: UserId | 'system';
  /** The actor's role at the time, stored in the entry details. */
  readonly role?: AuditCode;
  /** Action code, e.g. `ticket.priority_changed`. */
  readonly action: AuditCode;
  /** Resource type and id, e.g. `ticket:0192...`. */
  readonly target: string;
  readonly outcome: 'success' | 'failure';
  readonly details?: Readonly<Record<string, AuditDetailValue>>;
  /** UTC milliseconds. */
  readonly timestampMs: Instant;
}

/** Thrown when an entry cannot be recorded. The caller's transaction must roll back (requirement 18.9). */
export class AuditUnavailableError extends Error {
  readonly code = 'AUDIT_UNAVAILABLE' as const;

  constructor(options?: { cause?: unknown }) {
    super('Audit recording failed.', options);
    this.name = 'AuditUnavailableError';
  }
}

export interface AuditSearchOptions {
  readonly actor?: UserId;
  readonly action?: string;
  readonly target?: string;
  readonly fromMs?: Instant;
  readonly toMs?: Instant;
  /** Defaults to 100, capped at 1000. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditLogRow {
  readonly id: string;
  readonly actor: UserId | 'system';
  readonly action: string;
  readonly target: string;
  readonly outcome: 'success' | 'failure';
  readonly details: Record<string, unknown> | undefined;
  readonly timestampMs: Instant;
  readonly hash: string;
  readonly seqNum: number;
}

export interface ChainHead {
  readonly lastEntryId: string;
  readonly lastHash: string;
  readonly lastSeqNum: number;
  readonly anchoredSeqNum: number | undefined;
}

/** The chain head as written to the Object Lock bucket. */
export interface AnchoredChainHead {
  readonly tenantId: TenantId;
  readonly lastEntryId: string;
  readonly lastHash: string;
  readonly lastSeqNum: number;
  readonly anchoredAtMs: Instant;
}

/** Writes chain heads to immutable storage so a rewrite by a database superuser is detectable. */
export interface AnchorStore {
  /** Stores the head and returns its location. Storing the same head twice must be harmless. */
  anchor(head: AnchoredChainHead): Promise<string>;
  retrieve(location: string): Promise<AnchoredChainHead | undefined>;
  /** Most recent first. */
  listAnchors(tenantId: TenantId, limit: number): Promise<AnchoredChainHead[]>;
}
