import type { TenantId } from './erp-adapter';

export type StubRecordKind = 'student' | 'course';

/** One row of `core.erp_stub_records`. */
export interface StubRecord {
  kind: StubRecordKind;
  externalId: string;
  payload: unknown;
  /** ISO-8601 UTC timestamp with microsecond precision, as rendered by the database. */
  updatedAt: string;
}

/** Position after which a keyset page continues. */
export interface StubPosition {
  updatedAt: string;
  externalId: string;
}

/** Read side of the stub table. Every call runs under the Tenant's RLS context. */
export interface ErpStubReader {
  get(tenantId: TenantId, kind: StubRecordKind, externalId: string): Promise<StubRecord | null>;
  /** Records ordered by `(updatedAt, externalId)`, strictly after `after` when given. */
  listAfter(tenantId: TenantId, kind: StubRecordKind, after: StubPosition | null, limit: number): Promise<StubRecord[]>;
}

/** Write side, used only to seed fixtures and for Tenant_Admin edits in non-production environments. */
export interface ErpStubWriter {
  upsert(tenantId: TenantId, kind: StubRecordKind, externalId: string, payload: unknown): Promise<void>;
}

/**
 * Runs a parameterised statement inside the Tenant's RLS transaction and returns the rows.
 * The server wires this to `withTenant()` from `@campusconnect/db`, which keeps the database driver out of this package.
 */
export type TenantScopedQuery = (
  tenantId: TenantId,
  text: string,
  params: readonly unknown[],
) => Promise<Record<string, unknown>[]>;

const UPDATED_AT_SQL = `to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const COLUMNS = `kind, external_id, payload, ${UPDATED_AT_SQL} AS updated_at`;

function toRecord(row: Record<string, unknown>): StubRecord {
  return {
    kind: row['kind'] as StubRecordKind,
    externalId: String(row['external_id']),
    payload: row['payload'],
    updatedAt: String(row['updated_at']),
  };
}

/** Stub store over `core.erp_stub_records`. Tenant isolation comes from RLS plus an explicit `tenant_id` filter. */
export class SqlErpStubStore implements ErpStubReader, ErpStubWriter {
  constructor(private readonly query: TenantScopedQuery) {}

  async get(tenantId: TenantId, kind: StubRecordKind, externalId: string): Promise<StubRecord | null> {
    const rows = await this.query(
      tenantId,
      `SELECT ${COLUMNS} FROM core.erp_stub_records WHERE tenant_id = $1 AND kind = $2 AND external_id = $3`,
      [tenantId, kind, externalId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async listAfter(
    tenantId: TenantId,
    kind: StubRecordKind,
    after: StubPosition | null,
    limit: number,
  ): Promise<StubRecord[]> {
    const rows = after
      ? await this.query(
          tenantId,
          `SELECT ${COLUMNS} FROM core.erp_stub_records
           WHERE tenant_id = $1 AND kind = $2 AND (updated_at, external_id) > ($3::timestamptz, $4)
           ORDER BY updated_at, external_id LIMIT $5`,
          [tenantId, kind, after.updatedAt, after.externalId, limit],
        )
      : await this.query(
          tenantId,
          `SELECT ${COLUMNS} FROM core.erp_stub_records
           WHERE tenant_id = $1 AND kind = $2
           ORDER BY updated_at, external_id LIMIT $3`,
          [tenantId, kind, limit],
        );
    return rows.map(toRecord);
  }

  async upsert(tenantId: TenantId, kind: StubRecordKind, externalId: string, payload: unknown): Promise<void> {
    await this.query(
      tenantId,
      `INSERT INTO core.erp_stub_records (tenant_id, kind, external_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (tenant_id, kind, external_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [tenantId, kind, externalId, JSON.stringify(payload)],
    );
  }
}
