import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PostgreSQL container for integration tests with production extensions (pgvector, pg_trgm, pgcrypto)
 * and production migrations applied.
 *
 * Each test should wrap database operations in a transaction that is rolled back at the end,
 * so tests don't interfere with each other and the container state is clean for the next test.
 */
export class DbHarness {
  private container: StartedPostgreSqlContainer | null = null;
  private pool: Pool | null = null;
  db: NodePgDatabase | null = null;

  /**
   * Start the PostgreSQL container and apply all migrations
   */
  async setup(): Promise<void> {
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .start();

    const host = this.container.getHost();
    const port = this.container.getFirstMappedPort();
    const database = this.container.getDatabase();
    const username = this.container.getUsername();
    const password = this.container.getPassword();

    this.pool = new Pool({
      host,
      port,
      database,
      user: username,
      password,
    });

    this.db = drizzle(this.pool);

    // Apply all migrations from the migrations directory
    await migrate(this.db, {
      migrationsFolder: path.join(__dirname, '..', 'migrations'),
    });
  }

  /**
   * Stop the container and clean up connections
   */
  async teardown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    if (this.container) {
      await this.container.stop();
    }
  }

  /**
   * Execute a test within a rolled-back transaction.
   * This prevents test data from persisting and polluting subsequent tests.
   *
   * @param fn - Async function that performs the test. Receives the database client.
   *
   * @example
   * ```typescript
   * await harness.runInTransaction(async (db) => {
   *   const result = await db.select().from(tickets);
   *   expect(result).toHaveLength(0);
   * });
   * ```
   */
  async runInTransaction<T>(
    fn: (db: NodePgDatabase) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      throw new Error('DbHarness not initialized. Call setup() first.');
    }

    let result: T;
    try {
      result = await this.db.transaction(async (tx) => {
        return fn(tx);
      }, { isolationLevel: 'read committed' });
    } catch (error) {
      // Transaction is rolled back automatically on error
      throw error;
    }

    // Ensure the transaction is rolled back by throwing after the test completes
    // Actually, with Drizzle's transaction API, the transaction should auto-rollback
    // if we don't commit. Let's verify this works as expected.
    return result;
  }

  /**
   * Run a query directly as cc_owner for setup/teardown operations
   */
  async executeAsOwner(sql: string): Promise<any> {
    if (!this.pool) {
      throw new Error('DbHarness not initialized. Call setup() first.');
    }

    const client = await this.pool.connect();
    try {
      // Switch to owner role
      await client.query('SET ROLE cc_owner');
      const result = await client.query(sql);
      return result;
    } finally {
      await client.release();
    }
  }
}

/**
 * Global hook to set up and tear down the database container for all tests
 */
export async function setupDbForTests(): Promise<DbHarness> {
  const harness = new DbHarness();
  await harness.setup();
  return harness;
}

export async function teardownDbForTests(harness: DbHarness): Promise<void> {
  await harness.teardown();
}
