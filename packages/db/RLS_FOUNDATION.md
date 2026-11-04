# RLS Foundation: CampusConnect Database

This document describes the row-level security (RLS) foundation for the CampusConnect platform.

## Overview

CampusConnect uses PostgreSQL row-level security to enforce tenant isolation at the database layer. Every query executed by the application runs with a tenant context set via transaction-local PostgreSQL settings. RLS policies on every multi-tenant table compare this context against the table's `tenant_id` column to enforce row visibility.

This design ensures:

- **Isolation at the database layer**: A query that forgets a tenant filter returns zero rows instead of another institution's data.
- **No context leakage**: Transaction-local settings are scoped to each request and don't persist across pooled connections.
- **Audit trail**: Cross-tenant access attempts are caught and logged before any data is returned.

## Database Roles

Four roles are created during initialization:

### `cc_owner`

- **Purpose**: Owner role for schema management, migrations, and setup tasks.
- **Capabilities**: Can create tables, functions, policies, and perform administrative operations.
- **Usage**: Used only during deployment/migrations, not at runtime.

### `cc_app`

- **Purpose**: Application role that all HTTP and staff service connections assume.
- **Capabilities**: Can read/write to application tables under RLS constraints.
- **Isolation**: Cannot bypass RLS policies; must have the correct tenant context set.
- **Usage**: The runtime application identity for every database connection.

### `cc_reader`

- **Purpose**: Read-only role for analytics, reports, and read replicas.
- **Capabilities**: Can only SELECT from tables, cannot write.
- **Usage**: Future analytics connections and read-only services.

### `cc_definer`

- **Purpose**: Role for SECURITY DEFINER functions that need elevated permissions.
- **Capabilities**: Used for functions that must operate without RLS constraints (e.g., finding resource owners).
- **Usage**: Only through SECURITY DEFINER stored procedures, never by application code directly.

## Database Extensions

Three PostgreSQL extensions are created:

- **`pgvector`**: For vector embeddings used by semantic search and AI-powered features.
- **`pg_trgm`**: For trigram-based full-text search and similarity matching (used for duplicate detection).
- **`pgcrypto`**: For cryptographic functions (used for hashing and encryption).

## Database Schemas

Four schemas organize different types of data:

### `core`

Core tenant data: user information, configuration, tickets, opportunities, etc.

- **RLS Applied**: Yes, every table has `tenant_id` and the `tenant_isolation` policy.
- **Owner**: Application modules (e.g., `Identity_Service`, `Ticket_Service`).

### `platform`

Platform infrastructure: outbox, timers, processed events, audit pending.

- **RLS Applied**: Yes, every table has `tenant_id` and the `tenant_isolation` policy.
- **Owner**: Infrastructure components (`Outbox`, `SLA_Engine`, `Audit_Log`).

### `audit`

Append-only audit trail and hash chain state.

- **RLS Applied**: Yes, to enforce per-tenant isolation of audit logs.
- **Constraints**: INSERT and SELECT only; UPDATE and DELETE are forbidden.

### `analytics`

Fact tables and aggregates for dashboards and reports.

- **RLS Applied**: Yes, to enforce per-tenant visibility of computed metrics.
- **Population**: Refreshed hourly from domain events and snapshots.

## Transaction-Local Settings

Every request transaction sets four PostgreSQL settings that RLS policies reference:

```sql
SET LOCAL app.tenant_id = <tenant-uuid>
SET LOCAL app.user_id = <user-uuid>
SET LOCAL app.roles = {<role-names>}
SET LOCAL app.dept_ids = {<department-uuids>}
```

- **`app.tenant_id`**: UUID of the tenant. Used by all `tenant_isolation` policies.
- **`app.user_id`**: UUID of the authenticated user. Used for audit logging and ownership checks.
- **`app.roles`**: Array of role names (Student, Handler, Dept_Head, Executive, Ombudsperson, Tenant_Admin). Used for RBAC within stored procedures.
- **`app.dept_ids`**: Array of department UUIDs. Used to scope Handler access to their assigned departments.

The `LOCAL` keyword ensures these settings are scoped to the transaction and don't persist across requests sharing a pooled connection.

## Helper Functions

### `app.tenant() -> uuid`

Returns the current tenant ID from the `app.tenant_id` setting.

```sql
SELECT app.tenant() as current_tenant_id;
```

### `app.uid() -> uuid`

Returns the current user ID from the `app.user_id` setting.

```sql
SELECT app.uid() as current_user_id;
```

### `app.has_role(role_name text) -> boolean`

Checks if the current user has a specific role.

```sql
SELECT app.has_role('Handler') as is_handler;
```

### `app.depts() -> uuid[]`

Returns the current user's department IDs.

```sql
SELECT app.depts() as user_departments;
```

### `app.owner_tenant_of(resource_type text, resource_id uuid) -> uuid`

SECURITY DEFINER function to find the tenant that owns a resource. Used to prevent cross-tenant access without revealing resource existence.

```sql
SELECT app.owner_tenant_of('ticket', $1) as owning_tenant_id;
```

## RLS Policies

Every multi-tenant table in `core` and `platform` schemas has the `tenant_isolation` policy:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = app.tenant())
  WITH CHECK (tenant_id = app.tenant());
```

- **`USING` clause**: Determines which rows are visible in SELECT, UPDATE, and DELETE operations.
- **`WITH CHECK` clause**: Determines which rows can be written in INSERT and UPDATE operations.

Both clauses enforce that the row's `tenant_id` must match the current tenant context.

## TypeScript Integration

### `withTenant(db, ctx, fn)`

Wraps a database operation with tenant context isolation.

```typescript
import { withTenant, type RequestContext } from "@campusconnect/db";

const ctx: RequestContext = {
  tenantId: "550e8400-e29b-41d4-a716-446655440000",
  userId: "660e8400-e29b-41d4-a716-446655440001",
  roles: ["Handler", "Dept_Head"],
  departmentIds: ["770e8400-e29b-41d4-a716-446655440002"],
};

const tickets = await withTenant(db, ctx, async (tx) => {
  // All queries here run with tenant context set
  return tx.select().from(tickets);
});
```

The function:

1. Opens a transaction
2. Sets all four transaction-local settings from the `RequestContext`
3. Executes the provided function with the configured transaction
4. Returns the result
5. Auto-commits on success or rolls back on error

### `runMigrations(db)`

Applies all pending database migrations.

```typescript
import { runMigrations } from "@campusconnect/db";

await runMigrations(db);
```

## Migration Strategy

Migrations are stored in `src/migrations/` as numbered SQL files:

- `0001_init_roles_and_extensions.sql`: Creates roles, extensions, schemas, and helper functions
- `0002_*_*.sql`: Subsequent migrations for table creation and policy application

Each migration is idempotent and can be rerun safely. Drizzle's migration system tracks applied migrations in the `__drizzle_migrations__` table.

## Testing

Integration tests use Testcontainers to spin up a PostgreSQL 16 container with production extensions and migrations applied. Each test runs in a rolled-back transaction to prevent test data from persisting.

```typescript
import { DbHarness } from "@campusconnect/db/test/db-harness";

const harness = new DbHarness();
await harness.setup();

await harness.runInTransaction(async (db) => {
  // Test with RLS enabled and migrations applied
});

await harness.teardown();
```

## Cross-Tenant Access Prevention

When a user attempts to access a resource belonging to another tenant:

1. The `tenant_isolation` policy on the resource table returns zero rows.
2. The API handler uses `app.owner_tenant_of()` to determine the owning tenant.
3. An audit entry is logged with both the requesting and targeted tenant IDs.
4. A 403 Forbidden response is returned without revealing whether the resource exists.

This approach prevents information disclosure while maintaining a clear audit trail for security investigations.

## Performance Considerations

- **Index design**: Every index on a multi-tenant table leads with `tenant_id` to allow the query planner to use the index even with RLS filters.
- **Policy efficiency**: RLS policies wrap setting lookups in `(SELECT ...)` to ensure the planner evaluates them once per statement rather than once per row.
- **Isolation level**: Read Committed isolation is sufficient for most queries; Serializable is used only for operations requiring strict serialization.

## Monitoring

Monitoring is established through:

- **Audit log**: Every row-level operation logs the actor, tenant, and timestamp.
- **Metrics**: Connection pool size, transaction latency, and policy enforcement errors.
- **Alerts**: Unusual cross-tenant access attempts or failed policy evaluations.

## Future Extensions

This foundation supports:

- **Schema-per-tenant mode**: By removing RLS and assigning a schema per tenant.
- **Database-per-tenant mode**: By scaling from one database to multiple databases with shared management infrastructure.
- **Tenant-specific row-level policies**: By allowing tenants to define additional filtering rules on their data.
