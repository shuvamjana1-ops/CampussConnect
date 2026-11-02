// Audit search and chain verification for Tenant_Admin (requirements 18.2, 18.4, 18.5, 18.6).

import { verifyChain, type HashedAuditEntry } from '@campusconnect/domain/audit';
import type { TenantId } from '@campusconnect/domain/types';
import { AuditService } from './audit.service';
import type {
  AnchorStore,
  AuditDatabase,
  AuditLogRow,
  AuditRecordInput,
  AuditSearchOptions,
  AuditSqlClient,
} from './audit.types';

export const MAX_SEARCH_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SEARCH_TIMEOUT_MS = 30_000;
const VERIFY_BATCH = 1000;
const ANCHOR_LOOKUP = 1000;
/** Postgres error code for `statement_timeout` cancellation. */
const QUERY_CANCELED = '57014';

/** The audit search ran past `statement_timeout`; the API maps it to `SEARCH_TIMEOUT` (18.6). */
export class AuditSearchTimeoutError extends Error {
  readonly code = 'SEARCH_TIMEOUT' as const;
  constructor(options?: { cause?: unknown }) {
    super('Audit search timed out.', options);
    this.name = 'AuditSearchTimeoutError';
  }
}

/** The requested range is wider than 30 days or inverted. */
export class AuditRangeError extends RangeError {
  constructor() {
    super('Audit search range must be positive and at most 30 days.');
    this.name = 'AuditRangeError';
  }
}

export interface AuditVerifyRequest {
  /** First chain position to verify (inclusive). Defaults to 1. */
  readonly fromSeqNum?: number;
  /** Last chain position to verify (inclusive). Defaults to the chain head. */
  readonly toSeqNum?: number;
}

export interface AuditVerifyResult {
  readonly isValid: boolean;
  readonly entriesChecked: number;
  readonly firstFailingEntryId?: string;
  /** Anchors inside the range that were compared with the chain. */
  readonly anchorsChecked: number;
  /** Anchors whose hash differs from the chain, which shows a rewrite even when the chain is self-consistent. */
  readonly anchorMismatches: readonly number[];
}

async function useTenant(tx: AuditSqlClient, tenantId: TenantId): Promise<void> {
  await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export class AuditAdminService {
  private readonly audit = new AuditService();

  constructor(
    private readonly db: AuditDatabase,
    private readonly anchors: AnchorStore,
  ) {}

  /** Searches by actor, action, target and a time range of at most 30 days, with a 30-second statement timeout. */
  async search(
    tenantId: TenantId,
    options: AuditSearchOptions & { readonly fromMs: number; readonly toMs: number },
  ): Promise<AuditLogRow[]> {
    const span = options.toMs - options.fromMs;
    if (!(span >= 0) || span > MAX_SEARCH_RANGE_MS) throw new AuditRangeError();
    try {
      return await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        await tx.query(`SET LOCAL statement_timeout = ${SEARCH_TIMEOUT_MS}`);
        return this.audit.search(tx, tenantId, options);
      });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === QUERY_CANCELED) {
        throw new AuditSearchTimeoutError({ cause: error });
      }
      throw error;
    }
  }

  /**
   * Streams the range in batches through `verifyChain`, carrying the last hash between batches, then compares
   * every anchor in the range with the chain entry at the anchored position.
   */
  async verify(tenantId: TenantId, request: AuditVerifyRequest = {}): Promise<AuditVerifyResult> {
    const from = Math.max(1, request.fromSeqNum ?? 1);
    const to = request.toSeqNum ?? Number.MAX_SAFE_INTEGER;
    if (to < from) throw new AuditRangeError();

    const anchored = await this.anchors.listAnchors(tenantId, ANCHOR_LOOKUP);
    const anchorBySeq = new Map(anchored.filter((a) => a.lastSeqNum >= from && a.lastSeqNum <= to).map((a) => [a.lastSeqNum, a]));
    const mismatches: number[] = [];
    const seenAnchors = new Set<number>();

    let checked = 0;
    let afterSeq = from - 1;
    let prevHash = '';
    let failingId: string | undefined;

    for (;;) {
      const batch = await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        if (afterSeq === from - 1 && from > 1) {
          const [previous] = await this.audit.readChain(tx, tenantId, from - 2, 1);
          prevHash = previous?.hash ?? '';
        }
        return this.audit.readChain(tx, tenantId, afterSeq, VERIFY_BATCH);
      });
      const rows = batch.filter((row) => row.seqNum <= to);
      if (rows.length === 0) break;

      const entries: HashedAuditEntry[] = rows.map((row) => ({
        id: row.id,
        tenantId,
        actor: row.actor,
        action: row.action,
        target: row.target,
        outcome: row.outcome,
        timestampMs: row.timestampMs,
        hash: row.hash,
        ...(row.details === undefined ? {} : { details: row.details }),
      }));
      const result = verifyChain(entries, prevHash);
      for (const row of rows) {
        const anchor = anchorBySeq.get(row.seqNum);
        if (anchor === undefined) continue;
        seenAnchors.add(row.seqNum);
        if (anchor.lastHash !== row.hash || anchor.lastEntryId !== row.id) mismatches.push(row.seqNum);
      }
      if (!result.isValid) {
        checked += entries.findIndex((entry) => entry.id === result.firstFailingEntryId);
        failingId = result.firstFailingEntryId;
        break;
      }
      checked += rows.length;
      prevHash = rows[rows.length - 1]!.hash;
      afterSeq = rows[rows.length - 1]!.seqNum;
      if (rows.length < batch.length || batch.length < VERIFY_BATCH) break;
    }

    // An anchor for a position the chain no longer has means entries were removed.
    for (const seq of anchorBySeq.keys()) {
      if (!seenAnchors.has(seq) && failingId === undefined) mismatches.push(seq);
    }

    return {
      isValid: failingId === undefined && mismatches.length === 0,
      entriesChecked: checked,
      anchorsChecked: anchorBySeq.size,
      anchorMismatches: mismatches.sort((a, b) => a - b),
      ...(failingId === undefined ? {} : { firstFailingEntryId: failingId }),
    };
  }

  /** Records a rejected attempt to modify or delete an entry, in its own transaction so the failure persists. */
  async recordRejectedModification(tenantId: TenantId, input: AuditRecordInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await this.audit.record(tx, tenantId, input);
    });
  }
}
