import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run all pending database migrations
 *
 * @param db - The Drizzle database client
 * @returns A promise that resolves when all migrations have been applied
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { runMigrations } from '@campusconnect/db/migrator';
 *
 * const pool = new Pool({ ... });
 * const db = drizzle(pool);
 * await runMigrations(db);
 * ```
 */
export async function runMigrations(db: NodePgDatabase): Promise<void> {
  await migrate(db, {
    migrationsFolder: path.join(__dirname, 'migrations'),
  });
}
