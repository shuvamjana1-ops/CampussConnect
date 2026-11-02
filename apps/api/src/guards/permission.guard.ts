import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import {
  ACTION_RESOURCE,
  authorize,
  type Action,
  type Principal,
  type ResourceAttrs,
} from '@campusconnect/domain/rbac';
import { ApiError } from '../api-error';
import type { AppClsStore } from '../request-context';
import { IS_PUBLIC, REQUIRED_ACTION } from './public.decorator';

/**
 * RBAC guard. Calls `authorize` for the action named by `@RequirePermission` against the caller's own Tenant.
 * Scope predicates that need the loaded resource (department, owner) are applied again by the service with the
 * resource attributes. A route without `@RequirePermission` is denied, so a forgotten decorator fails closed (2.5).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true) return true;

    const action = this.reflector.getAllAndOverride<Action | undefined>(REQUIRED_ACTION, targets);
    const principal = this.cls.get('principal');
    if (action === undefined || principal === undefined) throw new ApiError('INSUFFICIENT_PERMISSION', {});

    const decision = authorize(
      principal,
      { kind: ACTION_RESOURCE[action], tenantId: principal.tenantId },
      action,
      scopeProbe(principal),
    );
    if (decision.effect === 'deny') throw new ApiError(decision.code, {});
    return true;
  }
}

/**
 * Attributes under which every scope the caller could hold is satisfied, so the route-level check asks only
 * whether some role grants the action at all. The service narrows to the actual resource afterwards.
 */
function scopeProbe(principal: Principal): ResourceAttrs {
  const first = principal.departmentIds[0];
  return {
    ownerId: principal.userId,
    isGrievance: true,
    audienceDepartmentIds: principal.departmentIds,
    ...(first === undefined ? {} : { departmentId: first }),
  };
}
