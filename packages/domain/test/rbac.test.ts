import { describe, expect, it } from 'vitest';
import { authorize, reportScopeFilter, type Principal } from '../src/rbac';
import { departmentId, tenantId, userId } from '../src/types';

const T = tenantId('11111111-1111-1111-1111-111111111111');
const U = userId('22222222-2222-2222-2222-222222222222');
const D1 = departmentId('33333333-3333-3333-3333-333333333333');
const D2 = departmentId('44444444-4444-4444-4444-444444444444');

const base: Principal = { userId: U, tenantId: T, roles: ['student'], departmentIds: [], grants: [], enrolmentStatus: 'active' };
const ticket = { kind: 'ticket', tenantId: T } as const;

describe('authorize', () => {
  it('lets an active Student write own Tickets only', () => {
    expect(authorize(base, ticket, 'ticket.respond', { ownerId: U }).effect).toBe('allow');
    expect(authorize(base, ticket, 'ticket.respond', { ownerId: userId('55555555-5555-5555-5555-555555555555') }).effect).toBe('deny');
  });

  it('keeps read of own Tickets but denies writes for an inactive Student (17.9)', () => {
    const inactive = { ...base, enrolmentStatus: 'inactive' as const };
    expect(authorize(inactive, ticket, 'ticket.read_own', { ownerId: U }).effect).toBe('allow');
    expect(authorize(inactive, ticket, 'ticket.create').effect).toBe('deny');
    expect(authorize(inactive, ticket, 'ticket.withdraw', { ownerId: U })).toEqual({ effect: 'deny', code: 'INSUFFICIENT_PERMISSION' });
  });

  it('scopes Handlers to assigned departments', () => {
    const h: Principal = { ...base, roles: ['handler'], departmentIds: [D1] };
    expect(authorize(h, ticket, 'ticket.work', { departmentId: D1 }).effect).toBe('allow');
    expect(authorize(h, ticket, 'ticket.work', { departmentId: D2 }).effect).toBe('deny');
  });

  it('requires grants and denies cross-Tenant access', () => {
    const admin: Principal = { ...base, roles: ['tenant_admin'] };
    const opp = { kind: 'opportunity', tenantId: T } as const;
    expect(authorize(admin, opp, 'opportunity.publish').effect).toBe('deny');
    expect(authorize({ ...admin, grants: ['opportunity.publish'] }, opp, 'opportunity.publish').effect).toBe('allow');
    expect(authorize(admin, { kind: 'tenant', tenantId: tenantId('99999999-9999-9999-9999-999999999999') }, 'tenant.configure').effect).toBe('deny');
  });

  it('limits Ombudsperson to Grievances and L3', () => {
    const o: Principal = { ...base, roles: ['ombudsperson'] };
    expect(authorize(o, ticket, 'ticket.reveal_identity', { isGrievance: true }).effect).toBe('allow');
    expect(authorize(o, ticket, 'ticket.reveal_identity', { escalationLevel: 'L1' }).effect).toBe('deny');
  });
});

describe('reportScopeFilter', () => {
  it('maps roles to report scope', () => {
    expect(reportScopeFilter({ ...base, roles: ['executive'] })).toEqual({ kind: 'all' });
    expect(reportScopeFilter({ ...base, roles: ['dept_head'], departmentIds: [D1] })).toEqual({ kind: 'departments', departmentIds: [D1] });
    expect(reportScopeFilter(base)).toEqual({ kind: 'none' });
  });
});
