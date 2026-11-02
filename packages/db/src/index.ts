// @campusconnect/db: database access through withTenant(). Tables owned by server module <module>
// live in src/schema/<module>/ and are imported as @campusconnect/db/schema/<module>.
export { withTenant, ownerTenantOf, type RequestContext } from './with-tenant';
export { runMigrations } from './migrator';
export {
  createSqlDatabase,
  type SqlClient,
  type SqlDatabase,
  type SqlDatabaseOptions,
} from './sql-database';
