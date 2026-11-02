import type { ClsStore } from 'nestjs-cls';
import type { Principal } from '@campusconnect/domain/rbac';

/** The values `withTenant` needs to set `app.tenant_id`, `app.user_id`, `app.roles` and `app.dept_ids`. Mirrors `RequestContext` in `@campusconnect/db`. */
export interface RequestContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: string[];
  readonly departmentIds: string[];
}

/**
 * Values kept for the life of one request in AsyncLocalStorage (via `nestjs-cls`). The request id is the CLS id.
 * Guards set these after they resolve the session; Tenant resolution comes only from the session (1.2).
 */
export interface AppClsStore extends ClsStore {
  tenantId?: string;
  userId?: string;
  /** Populated by the session guard; passed to `withTenant`. */
  requestContext?: RequestContext;
  /** Populated by the session guard; passed to `authorize`. */
  principal?: Principal;
}
