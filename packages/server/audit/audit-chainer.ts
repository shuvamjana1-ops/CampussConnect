// Moves pending audit entries into the hash-chained audit log and anchors chain heads.

import { chainHash, type AuditEntry } from '@campusconnect/domain/audit';
import type { Instant, TenantId, UserId } from '@campusconnect/domain/types';
import { AuditService } from './audit.service';
import type { AnchorStore, AuditDatabase, AuditSqlClient } from './audit.types';

export const CHAIN_CADENCE_MS = 500;
export const ANCHOR_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE = 500;

interface PendingRow {
  id: string;
  actor: string | null;
  action: string;
  target: string;
  outcome: 'success' | 'failure';
  details: Record<string, unknown> | null;
  timestamp_ms: string | number;
}

export interface AuditChainerOptions {
  /** Tenants to chain on each pass. */
  readonly listTenants: () => Promise<readonly TenantId[]>;
  readonly onError?: (error: unknown, tenantId: TenantId | undefined) => void;
  readonly chainCadenceMs?: number;
  readonly anchorIntervalMs?: number;
  readonly now?: () => number;
}

/** Sets the transaction-local tenant that row-level security reads. */
async function useTenant(tx: AuditSqlClient, tenantId: TenantId): Promise<void> {
  await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export class AuditChainer {
  private readonly service = new AuditService();
  private readonly cadenceMs: number;
  private readonly anchorMs: number;
  private readonly now: () => number;
  private chainTimer: NodeJS.Timeout | undefined;
  private anchorTimer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: AuditDatabase,
    private readonly anchorStore: AnchorStore,
    private readonly options: AuditChainerOptions,
  ) {
    this.cadenceMs = options.chainCadenceMs ?? CHAIN_CADENCE_MS;
    this.anchorMs = options.anchorIntervalMs ?? ANCHOR_INTERVAL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Starts the chaining loop (500 ms) and the hourly anchoring loop. Safe to run on several instances. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const chainLoop = (): void => {
      void this.chainAll().finally(() => {
        if (!this.running) return;
        this.chainTimer = setTimeout(chainLoop, this.cadenceMs);
        this.chainTimer.unref();
      });
    };
    const anchorLoop = (): void => {
      void this.anchorAll().finally(() => {
        if (!this.running) return;
        this.anchorTimer = setTimeout(anchorLoop, this.anchorMs);
        this.anchorTimer.unref();
      });
    };
    chainLoop();
    this.anchorTimer = setTimeout(anchorLoop, this.anchorMs);
    this.anchorTimer.unref();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.chainTimer);
    clearTimeout(this.anchorTimer);
  }

  async chainAll(): Promise<void> {
    let tenants: readonly TenantId[];
    try {
      tenants = await this.options.listTenants();
    } catch (error) {
      this.options.onError?.(error, undefined);
      return;
    }
    for (const tenantId of tenants) {
      try {
        // Keep draining while a full batch comes back, so the backlog never outgrows the 2-second target.
        while ((await this.chainTenant(tenantId)) === BATCH_SIZE) {
          // continue
        }
      } catch (error) {
        this.options.onError?.(error, tenantId);
      }
    }
  }

  async anchorAll(): Promise<void> {
    let tenants: readonly TenantId[];
    try {
      tenants = await this.options.listTenants();
      await this.db.transaction((tx) => tx.query('SELECT audit.ensure_partitions(2)'));
    } catch (error) {
      this.options.onError?.(error, undefined);
      return;
    }
    for (const tenantId of tenants) {
      try {
        await this.anchorTenant(tenantId);
      } catch (error) {
        this.options.onError?.(error, tenantId);
      }
    }
  }

  /**
   * Chains up to one batch of pending entries for a tenant. A transaction-scoped advisory lock lets only one
   * chainer work on a tenant at a time; the others return 0. Returns the number of entries chained.
   */
  async chainTenant(tenantId: TenantId): Promise<number> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const lock = await tx.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtextextended('audit-chain:' || $1, 0)) AS locked`,
        [tenantId],
      );
      if (lock.rows[0]?.locked !== true) return 0;

      const pending = await tx.query<PendingRow>(
        `SELECT id::text AS id, actor::text AS actor, action, target, outcome, details, timestamp_ms
         FROM audit.audit_pending
         WHERE tenant_id = $1::uuid
         ORDER BY created_at, id
         LIMIT $2`,
        [tenantId, BATCH_SIZE],
      );
      if (pending.rows.length === 0) return 0;

      const head = await this.service.getChainHead(tx, tenantId);
      let prevHash = head?.lastHash ?? '';
      let seqNum = head?.lastSeqNum ?? 0;
      let lastId = head?.lastEntryId ?? '';

      for (const row of pending.rows) {
        const entry: AuditEntry = {
          id: row.id,
          tenantId,
          actor: row.actor === null ? 'system' : (row.actor as UserId),
          action: row.action,
          target: row.target,
          outcome: row.outcome,
          timestampMs: Number(row.timestamp_ms) as Instant,
          ...(row.details === null ? {} : { details: row.details }),
        };
        const hash = chainHash(prevHash, entry);
        seqNum += 1;
        await tx.query(
          `INSERT INTO audit.audit_log
             (id, tenant_id, actor, action, target, outcome, details, timestamp_ms, hash, seq_num)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
          [
            entry.id,
            tenantId,
            row.actor,
            entry.action,
            entry.target,
            entry.outcome,
            row.details === null ? null : JSON.stringify(row.details),
            entry.timestampMs,
            hash,
            seqNum,
          ],
        );
        prevHash = hash;
        lastId = entry.id;
      }

      await tx.query(`DELETE FROM audit.audit_pending WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`, [
        tenantId,
        pending.rows.map((row) => row.id),
      ]);
      await tx.query(
        `INSERT INTO audit.audit_chain_head (tenant_id, last_entry_id, last_hash, last_seq_num)
         VALUES ($1::uuid, $2::uuid, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE SET
           last_entry_id = EXCLUDED.last_entry_id,
           last_hash = EXCLUDED.last_hash,
           last_seq_num = EXCLUDED.last_seq_num,
           updated_at = now()`,
        [tenantId, lastId, prevHash, seqNum],
      );
      return pending.rows.length;
    });
  }

  /** Writes the tenant's chain head to the anchor store if it moved since the last anchor. Returns the location, if any. */
  async anchorTenant(tenantId: TenantId): Promise<string | undefined> {
    const head = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      return this.service.getChainHead(tx, tenantId);
    });
    if (head === undefined || head.anchoredSeqNum === head.lastSeqNum) return undefined;

    const location = await this.anchorStore.anchor({
      tenantId,
      lastEntryId: head.lastEntryId,
      lastHash: head.lastHash,
      lastSeqNum: head.lastSeqNum,
      anchoredAtMs: this.now() as Instant,
    });

    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      await tx.query(
        `UPDATE audit.audit_chain_head
         SET anchored_seq_num = $2, anchored_at = now(), anchor_location = $3
         WHERE tenant_id = $1::uuid AND last_seq_num >= $2`,
        [tenantId, head.lastSeqNum, location],
      );
    });
    return location;
  }
}
