import pg from 'pg';

/** Minimal SQL surface shared by the outbox and audit modules. */
export interface SqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** A pooled database that opens transactions. Structurally satisfies `OutboxDatabase` and `AuditDatabase`. */
export interface SqlDatabase extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  /** Runs `SELECT 1`; rejects when the database is unreachable. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface SqlDatabaseOptions {
  readonly connectionString: string;
  /** Maximum pooled connections. Defaults to 10. */
  readonly max?: number;
}

/** Creates the connection pool used by background runtimes. Request-path code uses `withTenant` instead. */
export function createSqlDatabase(options: SqlDatabaseOptions): SqlDatabase {
  const pool = new pg.Pool({ connectionString: options.connectionString, max: options.max ?? 10 });

  const asClient = (client: pg.Pool | pg.PoolClient): SqlClient => ({
    async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      const result = await client.query(text, values === undefined ? undefined : [...values]);
      return { rows: result.rows as Row[] };
    },
  });

  return {
    ...asClient(pool),
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(asClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
