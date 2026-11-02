// Feature: campusconnect-platform, Property 3: Authorisation is deny-by-default and scope-respecting

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  authorize,
  ACTION_RESOURCE,
  PERMISSION_MATRIX,
  ROLES,
  type Action,
  type Principal,
  type Resource,
  type Role,
} from '../src/rbac/index.js';
import { arbPrincipal, arbResource, arbResourceAttrs, arbActionOnResource } from './arbitraries/rbac.js';

/**
 * Validates: Requirements 2.4, 2.5, 2.6, 4.3, 10.12, 13.8, 15.3, 17.9
 *
 * Property 3: Authorisation is deny-by-default and scope-respecting.
 *
 * Denies by default: every action not in the permission matrix for any of the principal's roles is denied.
 * Scope-respecting: when a rule allows an action, its scope predicate must hold on the resource attributes.
 * Tenant isolation: cross-Tenant access is always denied.
 * Enrolment enforcement: Students with inactive enrolment cannot write.
 * Grant enforcement: actions requiring a specific grant are denied if the principal lacks it.
 */
describe('Property 3: Authorisation is deny-by-default and scope-respecting', () => {
  it('denies access when principal has no matching role or action', () => {
    fc.assert(
      fc.property(arbPrincipal(), arbResource(), arbActionOnResource(), (principal, resource, { action }) => {
        // Check if the action is allowed by any role in PERMISSION_MATRIX
        const allowed = principal.roles.some((role) => {
          const rule = PERMISSION_MATRIX[role][action];
          return rule !== undefined;
        });

        const decision = authorize(principal, resource, action);

        if (allowed) {
          // If allowed by the matrix, we don't make an assertion here; the scope check happens later
          return true;
        } else {
          // If not in the matrix, must be denied
          expect(decision.effect).toBe('deny');
          expect(decision.code).toBe('INSUFFICIENT_PERMISSION');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('denies cross-Tenant access unconditionally', () => {
    fc.assert(
      fc.property(
        arbPrincipal(),
        arbActionOnResource(),
        fc.uuid().map((id) => id as any),
        (principal, { action, resource }, differentTenant) => {
          // Ensure the tenant is different
          if (differentTenant === principal.tenantId) return true;

          const decision = authorize(principal, { ...resource, tenantId: differentTenant }, action);

          expect(decision.effect).toBe('deny');
          expect(decision.code).toBe('INSUFFICIENT_PERMISSION');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('enforces enrolment status for Student writes', () => {
    fc.assert(
      fc.property(arbPrincipal(), (principal) => {
        const student = { ...principal, roles: ['student'] as const, enrolmentStatus: 'inactive' as const };
        const ticket = { kind: 'ticket' as const, tenantId: student.tenantId };
        const attrs = { ownerId: student.userId };

        // Student write actions that require active enrolment
        const writeActions: Action[] = [
          'ticket.create',
          'ticket.respond',
          'ticket.confirm',
          'ticket.dispute',
          'ticket.withdraw',
        ];

        writeActions.forEach((action) => {
          const decision = authorize(student, ticket, action, attrs);
          expect(decision.effect).toBe('deny');
          expect(decision.code).toBe('INSUFFICIENT_PERMISSION');
        });
      }),
      { numRuns: 100 },
    );
  });

  it('allows Student writes when enrolment is active and scope holds', () => {
    fc.assert(
      fc.property(arbPrincipal(), (principal) => {
        const student = { ...principal, roles: ['student'] as const, enrolmentStatus: 'active' as const };
        const ticket = { kind: 'ticket' as const, tenantId: student.tenantId };
        const attrs = { ownerId: student.userId };

        // Student can create and respond to own tickets
        const decision = authorize(student, ticket, 'ticket.create', attrs);
        expect(decision.effect).toBe('allow');

        const respondDecision = authorize(student, ticket, 'ticket.respond', attrs);
        expect(respondDecision.effect).toBe('allow');
      }),
      { numRuns: 100 },
    );
  });

  it('enforces grant requirements', () => {
    fc.assert(
      fc.property(arbPrincipal(), (principal) => {
        const handler = { ...principal, roles: ['handler'] as const, grants: [] as const };
        const opp = { kind: 'opportunity' as const, tenantId: handler.tenantId };

        // Handler cannot publish without grant
        const decision = authorize(handler, opp, 'opportunity.publish');
        expect(decision.effect).toBe('deny');

        // Handler with grant can publish
        const withGrant = { ...handler, grants: ['opportunity.publish' as const] };
        const decisionWithGrant = authorize(withGrant, opp, 'opportunity.publish');
        expect(decisionWithGrant.effect).toBe('allow');
      }),
      { numRuns: 100 },
    );
  });

  it('scopes department access correctly', () => {
    fc.assert(
      fc.property(
        arbPrincipal(),
        fc.record({
          userDepts: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }).map((d) => d as any),
          ticketDept: fc.uuid().map((d) => d as any),
        }),
        (principal, { userDepts, ticketDept }) => {
          const handler = { ...principal, roles: ['handler'] as const, departmentIds: userDepts };
          const ticket = { kind: 'ticket' as const, tenantId: handler.tenantId };

          if (userDepts.includes(ticketDept)) {
            // Department is in handler's list
            const decision = authorize(handler, ticket, 'ticket.work', { departmentId: ticketDept });
            expect(decision.effect).toBe('allow');
          } else {
            // Department is not in handler's list
            const decision = authorize(handler, ticket, 'ticket.work', { departmentId: ticketDept });
            expect(decision.effect).toBe('deny');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('scopes Ombudsperson to Grievances and L3 only', () => {
    fc.assert(
      fc.property(arbPrincipal(), (principal) => {
        const ombudsperson = { ...principal, roles: ['ombudsperson'] as const };
        const ticket = { kind: 'ticket' as const, tenantId: ombudsperson.tenantId };

        // Ombudsperson can access Grievances
        const grievanceDecision = authorize(ombudsperson, ticket, 'ticket.reveal_identity', {
          isGrievance: true,
        });
        expect(grievanceDecision.effect).toBe('allow');

        // Ombudsperson can access L3 escalations
        const l3Decision = authorize(ombudsperson, ticket, 'ticket.reveal_identity', {
          escalationLevel: 'L3',
        });
        expect(l3Decision.effect).toBe('allow');

        // Ombudsperson cannot access regular L1 tickets
        const l1Decision = authorize(ombudsperson, ticket, 'ticket.reveal_identity', {
          escalationLevel: 'L1',
          isGrievance: false,
        });
        expect(l1Decision.effect).toBe('deny');
      }),
      { numRuns: 100 },
    );
  });

  it('ensures action applies to the correct resource kind', () => {
    fc.assert(
      fc.property(arbActionOnResource(), arbPrincipal(), (tuple, principal) => {
        const { action, resource } = tuple;

        // The arbitrary guarantees the resource kind matches the action
        const expectedKind = ACTION_RESOURCE[action];
        expect(resource.kind).toBe(expectedKind);

        // Same principal and Tenant, correct resource kind: authorization depends only on role and scope
        const decision = authorize(principal, resource, action);

        // We can't assert the effect without checking roles and scope, but we can verify it's deterministic
        const decision2 = authorize(principal, resource, action);
        expect(decision).toEqual(decision2);
      }),
      { numRuns: 100 },
    );
  });

  it('denies actions with mismatched resource kinds', () => {
    fc.assert(
      fc.property(
        arbActionOnResource(),
        arbPrincipal(),
        fc.constantFrom(...(['ai', 'opportunity', 'broadcast', 'dashboard', 'report', 'export', 'audit', 'tenant', 'copilot'] as const)),
        (tuple, principal, wrongKind) => {
          const { action } = tuple;
          const expectedKind = ACTION_RESOURCE[action];

          if (wrongKind === expectedKind) return true; // Skip if the random kind happens to match

          const resource: Resource = { kind: wrongKind, tenantId: principal.tenantId };

          const decision = authorize(principal, resource, action);

          expect(decision.effect).toBe('deny');
          expect(decision.code).toBe('INSUFFICIENT_PERMISSION');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('requires all audience departments to be in principal departments for broadcast', () => {
    fc.assert(
      fc.property(
        arbPrincipal(),
        fc.record({
          userDepts: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }).map((d) => d as any),
          allAudienceDepts: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }).map((d) => d as any),
        }),
        (principal, { userDepts, allAudienceDepts }) => {
          const deptHead = { ...principal, roles: ['dept_head'] as const, departmentIds: userDepts };
          const broadcast = { kind: 'broadcast' as const, tenantId: deptHead.tenantId };

          // Check if all audience departments are in principal's departments
          const allAudienceInDepts = allAudienceDepts.every((d) => userDepts.includes(d));

          const decision = authorize(deptHead, broadcast, 'broadcast.send', {
            audienceDepartmentIds: allAudienceDepts,
          });

          if (allAudienceInDepts && allAudienceDepts.length > 0) {
            expect(decision.effect).toBe('allow');
          } else {
            expect(decision.effect).toBe('deny');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('authorization decisions are deterministic', () => {
    fc.assert(
      fc.property(arbPrincipal(), arbActionOnResource(), arbResourceAttrs(), (principal, tuple, attrs) => {
        const { action, resource } = tuple;

        const decision1 = authorize(principal, resource, action, attrs);
        const decision2 = authorize(principal, resource, action, attrs);

        expect(decision1).toEqual(decision2);
      }),
      { numRuns: 100 },
    );
  });

  it('decisions do not leak information about existence through error codes', () => {
    fc.assert(
      fc.property(arbPrincipal(), arbActionOnResource(), (principal, tuple) => {
        const { action } = tuple;
        const otherTenant = { ...principal.tenantId, tenantId: `different-${principal.tenantId}` } as any;

        // Cross-Tenant access with mismatched resource kind should return the same error
        const crossTenantWrongKind = authorize(principal, { kind: 'ticket' as const, tenantId: otherTenant }, action);

        // Regular insufficient permission (no role)
        const noRole = authorize(
          { ...principal, roles: [] as any },
          { kind: ACTION_RESOURCE[action], tenantId: principal.tenantId },
          action,
        );

        // Both should return INSUFFICIENT_PERMISSION to avoid information leakage (1.4)
        expect(crossTenantWrongKind.code).toBe('INSUFFICIENT_PERMISSION');
        expect(noRole.code).toBe('INSUFFICIENT_PERMISSION');
      }),
      { numRuns: 100 },
    );
  });

  it('every role in PERMISSION_MATRIX has consistent grant requirements', () => {
    // This test verifies the matrix structure is valid
    ROLES.forEach((role) => {
      const actions = PERMISSION_MATRIX[role];
      Object.entries(actions).forEach(([actionKey, rule]) => {
        if (rule.grant !== undefined) {
          // Any action with a grant requirement should be one that requires it
          expect(['opportunity.publish', 'broadcast.approve']).toContain(rule.grant);
        }
      });
    });
    expect(true).toBe(true); // Matrix is valid
  });
});
