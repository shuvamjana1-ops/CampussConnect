// fast-check arbitraries for @campusconnect/domain/rbac.
import fc from 'fast-check';
import {
  ACTIONS,
  GRANTS,
  RESOURCE_KINDS,
  ROLES,
  ACTION_RESOURCE,
  type Action,
  type Principal,
  type Resource,
  type ResourceAttrs,
  type Role,
} from '../../src/rbac';
import { arbDepartmentId, arbTenantId, arbUserId } from './types';

export function arbRole(): fc.Arbitrary<Role> {
  return fc.constantFrom(...ROLES);
}

export function arbAction(): fc.Arbitrary<Action> {
  return fc.constantFrom(...ACTIONS);
}

export function arbPrincipal(): fc.Arbitrary<Principal> {
  return fc.record({
    userId: arbUserId(),
    tenantId: arbTenantId(),
    roles: fc.uniqueArray(arbRole(), { minLength: 1, maxLength: 3 }),
    departmentIds: fc.uniqueArray(arbDepartmentId(), { maxLength: 3 }),
    grants: fc.uniqueArray(fc.constantFrom(...GRANTS), { maxLength: GRANTS.length }),
    enrolmentStatus: fc.option(fc.constantFrom('active' as const, 'inactive' as const), { nil: undefined }),
  });
}

/** A resource of any kind, in the principal's Tenant most of the time. */
export function arbResource(principal?: Principal): fc.Arbitrary<Resource> {
  const tenant = principal === undefined ? arbTenantId() : fc.oneof({ weight: 9, arbitrary: fc.constant(principal.tenantId) }, arbTenantId());
  return fc.record({ kind: fc.constantFrom(...RESOURCE_KINDS), tenantId: tenant });
}

/**
 * Attributes biased towards the principal's own departments and user id so that scope predicates hold about as often
 * as they fail.
 */
export function arbResourceAttrs(principal?: Principal): fc.Arbitrary<ResourceAttrs> {
  const dept =
    principal !== undefined && principal.departmentIds.length > 0
      ? fc.oneof(fc.constantFrom(...principal.departmentIds), arbDepartmentId())
      : arbDepartmentId();
  const owner = principal === undefined ? arbUserId() : fc.oneof(fc.constant(principal.userId), arbUserId());
  return fc.record(
    {
      departmentId: dept,
      ownerId: owner,
      isGrievance: fc.boolean(),
      escalationLevel: fc.constantFrom('L1' as const, 'L2' as const, 'L3' as const),
      audienceDepartmentIds: fc.array(dept, { maxLength: 3 }),
    },
    { requiredKeys: [] },
  );
}

/** An action together with a resource of the kind it applies to (in the principal's Tenant if given). */
export function arbActionOnResource(principal?: Principal): fc.Arbitrary<{ action: Action; resource: Resource }> {
  return fc.tuple(arbAction(), arbResource(principal)).map(([action, resource]) => ({
    action,
    resource: { ...resource, kind: ACTION_RESOURCE[action] },
  }));
}
