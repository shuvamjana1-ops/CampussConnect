import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * RequestContext contains the authenticated user and tenant information
 * passed from the NestJS guards to the service layer.
 */
export interface RequestContext {
  tenantId: string; // UUID of the tenant
  userId: string; // UUID of the authenticated user
  roles: string[]; // Array of role names (Student, Handler, Dept_Head, Executive, Ombudsperson, Tenant_Admin)
  departmentIds: string[]; // Array of department UUIDs the user is assigned to (empty for Students)
}

/**
 * Wraps a database operation with tenant context isolation.
 *
 * Opens a transaction and sets four transaction-local PostgreSQL settings
 * before executing the provided function. This ensures all queries execute
 * under the correct tenant isolation without risking context leakage between
 * requests sharing a pooled connection.
 *
 * RLS policies reference these settings to enforce row-level security:
 * - app.tenant_id: Used by tenant_isolation policy on every multi-tenant table
 * - app.user_id: Used for audit logging and authorization
 * - app.roles: Used for RBAC within database functions
 * - app.dept_ids: Used to scope Handler access to specific departments
 *
 * @param db - The Drizzle database client
 * @param ctx - The request context with tenant, user, roles and department info
 * @param fn - The async function to execute within the transaction and context
 * @returns The result of the provided function
 *
 * @example
 * ```typescript
 * const result = await withTenant(db, ctx, async (tx) => {
 *   const tickets = await tx.select().from(tickets).where(eq(tickets.tenantId, ctx.tenantId));
 *   return tickets;
 * });
 * ```
 */
export async function withTenant<T>(
  db: NodePgDatabase,
  ctx: RequestContext,
  fn: (tx: NodePgDatabase) => Promise<T>
): Promise<T> {
  // Execute the entire operation in a transaction
  // The transaction will automatically handle atomicity and isolation
  const result = await db.transaction(async (tx) => {
    // Set transaction-local configuration for RLS policies
    // These persist only for the duration of this transaction
    await tx.execute(sql`SET LOCAL app.tenant_id = ${ctx.tenantId}`);
    await tx.execute(sql`SET LOCAL app.user_id = ${ctx.userId}`);
    await tx.execute(
      sql`SET LOCAL app.roles = ${sql.array(ctx.roles, 'text')}`
    );
    await tx.execute(
      sql`SET LOCAL app.dept_ids = ${sql.array(ctx.departmentIds, 'uuid')}`
    );

    // Execute the provided function with the configured transaction
    return fn(tx);
  });

  return result;
}

/**
 * Gets the owning tenant of a resource without revealing if the resource exists to other tenants.
 * This SECURITY DEFINER function is used to enforce cross-tenant access prevention.
 *
 * @param db - The Drizzle database client
 * @param resourceType - The type of resource (e.g., 'ticket', 'student')
 * @param resourceId - The UUID of the resource
 * @returns The tenant ID that owns the resource, or null if not found
 */
export async function ownerTenantOf(
  db: NodePgDatabase,
  resourceType: string,
  resourceId: string
): Promise<string | null> {
  const result = await db.execute(
    sql`SELECT app.owner_tenant_of(${resourceType}, ${resourceId}::uuid) as tenant_id`
  );
  return result.rows[0]?.tenant_id ?? null;
}
