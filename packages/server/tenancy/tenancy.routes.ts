// Framework-neutral route table for the Tenant_Admin configuration endpoints. The HTTP layer authenticates the
// request, builds the `TenancyActor` from the session, mounts these routes under `/tenant-config`, and maps
// `ConfigValidationError` to a `422 VALIDATION_FAILED` problem listing `fields` (see `toProblemStatus`).

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import type { TenancyService } from './tenancy.service';
import { ConfigNotFoundError, ConfigPermissionError, ConfigValidationError, type TenancyActor } from './tenancy.types';

export interface TenancyRouteRequest {
  readonly actor: TenancyActor;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface TenancyRoute {
  readonly method: 'GET' | 'PUT' | 'POST' | 'PATCH';
  /** Path relative to the mount point; `:name` marks a path parameter. */
  readonly path: string;
  readonly handler: (request: TenancyRouteRequest) => Promise<unknown>;
}

export function tenancyRoutes(service: TenancyService): readonly TenancyRoute[] {
  return [
    { method: 'GET', path: '/settings', handler: (r) => service.getConfig(r.actor) },
    { method: 'PATCH', path: '/settings', handler: (r) => service.updateConfig(r.actor, r.body) },
    { method: 'GET', path: '/departments', handler: (r) => service.listDepartments(r.actor) },
    { method: 'POST', path: '/departments', handler: (r) => service.createDepartment(r.actor, r.body) },
    { method: 'PATCH', path: '/departments/:id', handler: (r) => service.updateDepartment(r.actor, r.params['id'], r.body) },
    { method: 'GET', path: '/departments/:id/duty', handler: (r) => service.getDutyRoster(r.actor, r.params['id']) },
    { method: 'PUT', path: '/departments/:id/duty', handler: (r) => service.setDutyRoster(r.actor, r.params['id'], r.body) },
    { method: 'GET', path: '/categories', handler: (r) => service.listCategories(r.actor) },
    { method: 'POST', path: '/categories', handler: (r) => service.createCategory(r.actor, r.body) },
    { method: 'PATCH', path: '/categories/:id', handler: (r) => service.updateCategory(r.actor, r.params['id'], r.body) },
    { method: 'GET', path: '/routing-rules', handler: (r) => service.listRoutingRules(r.actor) },
    { method: 'PUT', path: '/routing-rules', handler: (r) => service.replaceRoutingRules(r.actor, r.body) },
    { method: 'GET', path: '/sla-policies', handler: (r) => service.listSlaPolicies(r.actor) },
    { method: 'PUT', path: '/sla-policies', handler: (r) => service.upsertSlaPolicy(r.actor, r.body) },
    { method: 'GET', path: '/working-calendar', handler: (r) => service.getWorkingCalendar(r.actor) },
    { method: 'PUT', path: '/working-calendar', handler: (r) => service.replaceWorkingCalendar(r.actor, r.body) },
    { method: 'GET', path: '/rate-limits', handler: (r) => service.listRateLimits(r.actor) },
    { method: 'PUT', path: '/rate-limits', handler: (r) => service.setRateLimit(r.actor, r.body) },
  ];
}

export interface TenancyErrorMapping {
  readonly code: typeof ErrorCode.VALIDATION_FAILED | typeof ErrorCode.INSUFFICIENT_PERMISSION | typeof ErrorCode.ACCESS_DENIED;
  readonly status: number;
  /** Present for `VALIDATION_FAILED`: every invalid field path with its rule and bounds. */
  readonly fields?: readonly FieldError[];
}

/** Maps a configuration error to its error code and HTTP status, or `undefined` for errors that are not ours. */
export function toProblemStatus(error: unknown): TenancyErrorMapping | undefined {
  if (error instanceof ConfigValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof ConfigPermissionError) {
    return { code: ErrorCode.INSUFFICIENT_PERMISSION, status: httpStatusOf(ErrorCode.INSUFFICIENT_PERMISSION) };
  }
  if (error instanceof ConfigNotFoundError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  return undefined;
}
