// Framework-neutral operator console routes. The HTTP layer authenticates the caller as a platform operator
// (a credential outside Tenant RBAC, G3), passes it as `operator`, and mounts these under `/operator`. Tenant
// sessions never reach these routes.

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import {
  OperatorAuthenticationError,
  ProvisioningFailedError,
  type OperatorPrincipal,
  type TenantProvisioningService,
} from './provisioning';
import { ConfigValidationError } from './tenancy.types';

export interface OperatorRouteRequest {
  /** Undefined when the operator credential is missing or invalid. */
  readonly operator: OperatorPrincipal | undefined;
  readonly body: unknown;
}

export interface OperatorRoute {
  readonly method: 'POST';
  readonly path: string;
  readonly handler: (request: OperatorRouteRequest) => Promise<unknown>;
}

export function operatorRoutes(provisioning: TenantProvisioningService): readonly OperatorRoute[] {
  return [{ method: 'POST', path: '/tenants', handler: (r) => provisioning.provision(r.operator, r.body) }];
}

export interface OperatorErrorMapping {
  readonly code: string;
  readonly status: number;
  readonly fields?: readonly FieldError[];
  /** Present for provisioning failures. */
  readonly step?: string;
  readonly tenantId?: string;
}

/** Maps provisioning and operator errors to a code and HTTP status, or `undefined` for errors that are not ours. */
export function toOperatorProblem(error: unknown): OperatorErrorMapping | undefined {
  if (error instanceof OperatorAuthenticationError) {
    return { code: ErrorCode.AUTHENTICATION_REQUIRED, status: httpStatusOf(ErrorCode.AUTHENTICATION_REQUIRED) };
  }
  if (error instanceof ConfigValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof ProvisioningFailedError) {
    return { code: error.code, status: 502, step: error.step, tenantId: error.tenantId };
  }
  return undefined;
}
