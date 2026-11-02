// Allowed: packages/db is the only place that imports the PostgreSQL driver.
import pg from 'pg';

export const pool = new pg.Pool();
