// fast-check arbitraries for @campusconnect/domain/audit.

import * as fc from 'fast-check';
import { type AuditEntry } from '../../src/audit/chain.js';
import { tenantId, userId, instant, type TenantId, type UserId, type Instant } from '../../src/types/index.js';

/**
 * Arbitrary for tenant IDs.
 */
export function tenantIds(): fc.Arbitrary<TenantId> {
  return fc.uuid().map((id) => tenantId(id));
}

/**
 * Arbitrary for user IDs or the system actor.
 */
export function actors(): fc.Arbitrary<UserId | 'system'> {
  return fc.oneof(
    fc.uuid().map((id) => userId(id)),
    fc.constant('system' as const),
  );
}

/**
 * Arbitrary for audit action codes.
 */
export function auditActions(): fc.Arbitrary<string> {
  const categories = ['auth', 'ticket', 'config', 'broadcast', 'report', 'identity'];
  const events = ['created', 'updated', 'deleted', 'accessed', 'failed', 'confirmed'];
  return fc
    .tuple(
      fc.sample(categories, 1),
      fc.sample(events, 1),
    )
    .map(([cat, evt]) => `${cat[0]}.${evt[0]}`);
}

/**
 * Arbitrary for audit targets (resource type and id).
 */
export function auditTargets(): fc.Arbitrary<string> {
  const types = ['ticket', 'user', 'config', 'broadcast', 'attachment'];
  return fc
    .tuple(
      fc.sample(types, 1),
      fc.uuid(),
    )
    .map(([type, id]) => `${type[0]}:${id}`);
}

/**
 * Arbitrary for audit details.
 */
export function auditDetails(): fc.Arbitrary<Record<string, unknown>> {
  return fc.object({
    maxDepth: 2,
    withNull: false,
    withDate: false,
    withTypedArrays: false,
    withMap: false,
    withSet: false,
    withObjectString: false,
  });
}

/**
 * Arbitrary for audit entries.
 */
export function auditEntries(opts?: { tenantId?: TenantId }): fc.Arbitrary<AuditEntry> {
  return fc
    .tuple(
      fc.uuid(),
      opts?.tenantId ? fc.constant(opts.tenantId) : tenantIds(),
      actors(),
      auditActions(),
      auditTargets(),
      fc.oneof(fc.constant('success' as const), fc.constant('failure' as const)),
      fc.oneof(auditDetails(), fc.constant(undefined)),
      fc
        .integer({ min: 0, max: 8.64e15 })
        .map((ms) => instant(ms)),
    )
    .map(([id, tid, actor, action, target, outcome, details, ts]) => ({
      id,
      tenantId: tid,
      actor,
      action,
      target,
      outcome,
      details,
      timestampMs: ts,
    }));
}

/**
 * Arbitrary for sequences of audit entries.
 */
export function auditEntrySequences(opts?: {
  tenantId?: TenantId;
  minLength?: number;
  maxLength?: number;
}): fc.Arbitrary<AuditEntry[]> {
  const tenantIdValue = opts?.tenantId ?? tenantIds();
  return fc.array(auditEntries({ tenantId: opts?.tenantId }), {
    minLength: opts?.minLength ?? 1,
    maxLength: opts?.maxLength ?? 50,
  });
}

export {};
