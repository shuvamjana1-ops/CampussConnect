import { SetMetadata } from '@nestjs/common';
import { ACTIONS, type Action } from '@campusconnect/domain/rbac';

export const IS_PUBLIC = 'cc:isPublic';
export const REQUIRED_ACTION = 'cc:requiredAction';

/** Marks a route that needs no session: health, OpenAPI and the `/auth/*` sign-in routes. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Requires the caller's roles to grant `action` (2.4, 2.5). The resource kind comes from the action, and the
 * resource Tenant is the session Tenant. Scope predicates over a loaded resource are checked by the service with `authorize`.
 */
export const RequirePermission = (action: Action): MethodDecorator & ClassDecorator => {
  if (!ACTIONS.includes(action)) throw new RangeError('Unknown action.');
  return SetMetadata(REQUIRED_ACTION, action);
};
