// @campusconnect/domain/rbac: RBAC permission matrix, authorize and report scope filtering.
import type { DepartmentId, TenantId, UserId } from '../types';

export const ROLES = ['student', 'handler', 'dept_head', 'executive', 'ombudsperson', 'tenant_admin'] as const;
export type Role = (typeof ROLES)[number];

export const GRANTS = ['opportunity.publish', 'broadcast.approve'] as const;
export type Grant = (typeof GRANTS)[number];

export interface Principal {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  /** At least one role (2.2). */
  readonly roles: readonly Role[];
  readonly departmentIds: readonly DepartmentId[];
  readonly grants: readonly Grant[];
  /** Students only (17.9). */
  readonly enrolmentStatus?: 'active' | 'inactive';
}

export const ACTIONS = [
  'ticket.create',
  'ticket.read_own',
  'ticket.respond',
  'ticket.confirm',
  'ticket.dispute',
  'ticket.withdraw',
  'ticket.read',
  'ticket.work',
  'ticket.reopen',
  'ticket.reveal_identity',
  'ticket.record_l3_decision',
  'ai.override_rate',
  'opportunity.publish',
  'broadcast.send',
  'broadcast.emergency',
  'broadcast.approve',
  'dashboard.read',
  'report.schedule',
  'export.annual',
  'audit.search',
  'tenant.configure',
  'copilot.use',
] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCE_KINDS = [
  'ticket',
  'ai',
  'opportunity',
  'broadcast',
  'dashboard',
  'report',
  'export',
  'audit',
  'tenant',
  'copilot',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** The kind of resource each action applies to; an action on any other kind is denied. */
export const ACTION_RESOURCE: Readonly<Record<Action, ResourceKind>> = {
  'ticket.create': 'ticket',
  'ticket.read_own': 'ticket',
  'ticket.respond': 'ticket',
  'ticket.confirm': 'ticket',
  'ticket.dispute': 'ticket',
  'ticket.withdraw': 'ticket',
  'ticket.read': 'ticket',
  'ticket.work': 'ticket',
  'ticket.reopen': 'ticket',
  'ticket.reveal_identity': 'ticket',
  'ticket.record_l3_decision': 'ticket',
  'ai.override_rate': 'ai',
  'opportunity.publish': 'opportunity',
  'broadcast.send': 'broadcast',
  'broadcast.emergency': 'broadcast',
  'broadcast.approve': 'broadcast',
  'dashboard.read': 'dashboard',
  'report.schedule': 'report',
  'export.annual': 'export',
  'audit.search': 'audit',
  'tenant.configure': 'tenant',
  'copilot.use': 'copilot',
};

export interface Resource {
  readonly kind: ResourceKind;
  readonly tenantId: TenantId;
}

export interface ResourceAttrs {
  /** Department that owns or is assigned the resource. */
  readonly departmentId?: DepartmentId;
  /** Ticket reporter (`reporterId`). */
  readonly ownerId?: UserId;
  /** Ticket category is a Grievance. */
  readonly isGrievance?: boolean;
  readonly escalationLevel?: 'L1' | 'L2' | 'L3';
  /** Departments a Broadcast audience is drawn from. */
  readonly audienceDepartmentIds?: readonly DepartmentId[];
}

export type Decision =
  | { readonly effect: 'allow' }
  | { readonly effect: 'deny'; readonly code: 'INSUFFICIENT_PERMISSION' };

type Scope =
  | 'any'
  | 'self' // create: the principal is the reporter
  | 'own' // resource owned by the principal
  | 'departments' // resource department is one of the principal's
  | 'ombudsperson_cases' // Grievances and L3 Tickets
  | 'audience_in_departments'; // every audience department is the principal's

interface Rule {
  readonly scope: Scope;
  /** Grant the principal must hold. */
  readonly grant?: Grant;
  /** Student writes need an active enrolment (17.9). */
  readonly requiresActiveEnrolment?: boolean;
}

type Matrix = { readonly [R in Role]: Readonly<Partial<Record<Action, Rule>>> };

const studentOwnWrite: Rule = { scope: 'own', requiresActiveEnrolment: true };

/** Static permission matrix (design, Identity_Service RBAC table). Anything absent is denied. */
export const PERMISSION_MATRIX: Matrix = {
  student: {
    'ticket.create': { scope: 'self', requiresActiveEnrolment: true },
    'ticket.read_own': { scope: 'own' },
    'ticket.respond': studentOwnWrite,
    'ticket.confirm': studentOwnWrite,
    'ticket.dispute': studentOwnWrite,
    'ticket.withdraw': studentOwnWrite,
    'copilot.use': { scope: 'any' },
  },
  handler: {
    'ticket.read': { scope: 'departments' },
    'ticket.work': { scope: 'departments' },
    'opportunity.publish': { scope: 'any', grant: 'opportunity.publish' },
  },
  dept_head: {
    'ticket.read': { scope: 'departments' },
    'ticket.work': { scope: 'departments' },
    'ticket.reopen': { scope: 'departments' },
    'ai.override_rate': { scope: 'departments' },
    'opportunity.publish': { scope: 'any', grant: 'opportunity.publish' },
    'broadcast.send': { scope: 'audience_in_departments' },
    'dashboard.read': { scope: 'departments' },
    'report.schedule': { scope: 'departments' },
  },
  executive: {
    'opportunity.publish': { scope: 'any', grant: 'opportunity.publish' },
    'broadcast.send': { scope: 'any' },
    'broadcast.emergency': { scope: 'any' },
    'broadcast.approve': { scope: 'any', grant: 'broadcast.approve' },
    'dashboard.read': { scope: 'any' },
    'report.schedule': { scope: 'any' },
    'export.annual': { scope: 'any' },
  },
  ombudsperson: {
    'ticket.read': { scope: 'ombudsperson_cases' },
    'ticket.work': { scope: 'ombudsperson_cases' },
    'ticket.reopen': { scope: 'any' },
    'ticket.reveal_identity': { scope: 'ombudsperson_cases' },
    'ticket.record_l3_decision': { scope: 'ombudsperson_cases' },
  },
  tenant_admin: {
    'opportunity.publish': { scope: 'any', grant: 'opportunity.publish' },
    'broadcast.send': { scope: 'any' },
    'broadcast.emergency': { scope: 'any' },
    'broadcast.approve': { scope: 'any', grant: 'broadcast.approve' },
    'audit.search': { scope: 'any' },
    'tenant.configure': { scope: 'any' },
  },
};

function inDepartments(principal: Principal, departmentId: DepartmentId | undefined): boolean {
  return departmentId !== undefined && principal.departmentIds.includes(departmentId);
}

function scopeHolds(rule: Rule, principal: Principal, attrs: ResourceAttrs): boolean {
  switch (rule.scope) {
    case 'any':
      return true;
    case 'self':
      return attrs.ownerId === undefined || attrs.ownerId === principal.userId;
    case 'own':
      return attrs.ownerId !== undefined && attrs.ownerId === principal.userId;
    case 'departments':
      return inDepartments(principal, attrs.departmentId);
    case 'ombudsperson_cases':
      return attrs.isGrievance === true || attrs.escalationLevel === 'L3';
    case 'audience_in_departments': {
      const audience = attrs.audienceDepartmentIds;
      return audience !== undefined && audience.length > 0 && audience.every((id) => principal.departmentIds.includes(id));
    }
  }
}

function ruleAllows(rule: Rule, principal: Principal, attrs: ResourceAttrs): boolean {
  if (rule.grant !== undefined && !principal.grants.includes(rule.grant)) return false;
  if (rule.requiresActiveEnrolment === true && principal.enrolmentStatus !== 'active') return false;
  return scopeHolds(rule, principal, attrs);
}

const DENY: Decision = { effect: 'deny', code: 'INSUFFICIENT_PERMISSION' };
const ALLOW: Decision = { effect: 'allow' };

/**
 * Allows only if the resource is in the principal's Tenant, the action applies to the resource kind, and some role
 * of the principal grants the action with a holding scope predicate. Everything else is denied (2.5).
 */
export function authorize(
  principal: Principal,
  resource: Resource,
  action: Action,
  attrs: ResourceAttrs = {},
): Decision {
  if (resource.tenantId !== principal.tenantId) return DENY;
  if (ACTION_RESOURCE[action] !== resource.kind) return DENY;
  for (const role of principal.roles) {
    const rule = PERMISSION_MATRIX[role][action];
    if (rule !== undefined && ruleAllows(rule, principal, attrs)) return ALLOW;
  }
  return DENY;
}

export type ReportScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'departments'; readonly departmentIds: readonly DepartmentId[] }
  | { readonly kind: 'none' };

/** Restricts report rows to the requester's role and department scope (15.3). */
export function reportScopeFilter(principal: Principal): ReportScope {
  if (principal.roles.some((role) => PERMISSION_MATRIX[role]['dashboard.read']?.scope === 'any')) {
    return { kind: 'all' };
  }
  if (principal.roles.some((role) => PERMISSION_MATRIX[role]['dashboard.read']?.scope === 'departments')) {
    return { kind: 'departments', departmentIds: [...new Set(principal.departmentIds)] };
  }
  return { kind: 'none' };
}
