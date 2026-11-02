// Recording and reading of audit entries.

import type { Instant, TenantId, UserId } from '@campusconnect/domain/types';
import {
  AuditUnavailableError,
  type AuditLogRow,
  type AuditRecordInput,
  type AuditSearchOptions,
  type AuditSqlClient,
  type ChainHead,
} from './audit.types';

interface LogRowSql {
  id: string;
  actor: string | null;
  action: string;
  target: string;
  outcome: 'success' | 'failure';
  details: Record<string, unknown> | null;
  timestamp_ms: string | number;
  hash: string;
  seq_num: string | number;
}

export function toLogRow(row: LogRowSql): AuditLogRow {
  return {
    id: row.id,
    actor: row.actor === null ? 'system' : (row.actor as UserId),
    action: row.action,
    target: row.target,
    outcome: row.outcome,
    details: row.details ?? undefined,
    timestampMs: Number(row.timestamp_ms) as Instant,
    hash: row.hash,
    seqNum: Number(row.seq_num),
  };
}

export const LOG_COLUMNS =
  'id::text AS id, actor::text AS actor, action, target, outcome, details, timestamp_ms, hash, seq_num';

const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_LIMIT = 1000;

/**
 * Records audit entries into `audit.audit_pending` using the caller's transaction, so the business change and its
 * audit entry commit or roll back together (requirement 18.9). The transaction must come from `withTenant`, which
 * sets the tenant that row-level security checks.
 */
export class AuditService {
  /**
   * Inserts one entry. Throws `AuditUnavailableError` (code `AUDIT_UNAVAILABLE`) if the insert fails; the caller must
   * let that error roll its transaction back. Never catch it and continue.
   */
  async record(tx: AuditSqlClient, tenantId: TenantId, input: AuditRecordInput): Promise<void> {
    const details: Record<string, string> = {};
    if (input.role !== undefined) details['role'] = input.role;
    for (const [key, value] of Object.entries(input.details ?? {})) {
      // The types already forbid free text. This guards callers that cast around them.
      if (typeof value !== 'string') throw new TypeError(`Audit detail "${key}" must be a string.`);
      details[key] = value;
    }
    try {
      await tx.query(
        `INSERT INTO audit.audit_pending (tenant_id, actor, action, target, outcome, details, timestamp_ms)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7)`,
        [
          tenantId,
          input.actor === 'system' ? null : input.actor,
          input.action,
          input.target,
          input.outcome,
          Object.keys(details).length > 0 ? JSON.stringify(details) : null,
          input.timestampMs,
        ],
      );
    } catch (cause) {
      throw new AuditUnavailableError({ cause });
    }
  }

  /** Searches the tenant's chained entries, newest first. Row-level security restricts rows to the current tenant. */
  async search(
    tx: AuditSqlClient,
    tenantId: TenantId,
    options: AuditSearchOptions = {},
  ): Promise<AuditLogRow[]> {
    const conditions = ['tenant_id = $1::uuid'];
    const values: unknown[] = [tenantId];
    const add = (condition: string, value: unknown): void => {
      values.push(value);
      conditions.push(condition.replace('?', `$${values.length}`));
    };
    if (options.actor !== undefined) add('actor = ?::uuid', options.actor);
    if (options.action !== undefined) add('action = ?', options.action);
    if (options.target !== undefined) add('target = ?', options.target);
    if (options.fromMs !== undefined) add('timestamp_ms >= ?', options.fromMs);
    if (options.toMs !== undefined) add('timestamp_ms <= ?', options.toMs);
    const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT);
    const offset = Math.max(0, options.offset ?? 0);
    values.push(limit, offset);

    const result = await tx.query<LogRowSql>(
      `SELECT ${LOG_COLUMNS} FROM audit.audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp_ms DESC, seq_num DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows.map(toLogRow);
  }

  /**
   * Reads entries by chain position, oldest first, for integrity verification.
   * `afterSeqNum` is exclusive; pass 0 to start at the beginning of the chain.
   */
  async readChain(
    tx: AuditSqlClient,
    tenantId: TenantId,
    afterSeqNum: number,
    limit: number,
  ): Promise<AuditLogRow[]> {
    const result = await tx.query<LogRowSql>(
      `SELECT ${LOG_COLUMNS} FROM audit.audit_log
       WHERE tenant_id = $1::uuid AND seq_num > $2
       ORDER BY seq_num ASC LIMIT $3`,
      [tenantId, afterSeqNum, limit],
    );
    return result.rows.map(toLogRow);
  }

  async getChainHead(tx: AuditSqlClient, tenantId: TenantId): Promise<ChainHead | undefined> {
    const result = await tx.query<{
      last_entry_id: string;
      last_hash: string;
      last_seq_num: string | number;
      anchored_seq_num: string | number | null;
    }>(
      `SELECT last_entry_id::text AS last_entry_id, last_hash, last_seq_num, anchored_seq_num
       FROM audit.audit_chain_head WHERE tenant_id = $1::uuid`,
      [tenantId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      lastEntryId: row.last_entry_id,
      lastHash: row.last_hash,
      lastSeqNum: Number(row.last_seq_num),
      anchoredSeqNum: row.anchored_seq_num === null ? undefined : Number(row.anchored_seq_num),
    };
  }
}
