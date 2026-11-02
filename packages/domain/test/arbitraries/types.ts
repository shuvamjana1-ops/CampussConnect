// fast-check arbitraries for @campusconnect/domain/types.
import fc from 'fast-check';
import {
  departmentId,
  instant,
  tenantId,
  ticketId,
  userId,
  type DepartmentId,
  type Instant,
  type TenantId,
  type TicketId,
  type UserId,
} from '../../src/types';

/** Default range for generated instants: 2018-01-01 to 2032-01-01 UTC, which spans several DST rule changes. */
export const DEFAULT_INSTANT_RANGE = { min: Date.UTC(2018, 0, 1), max: Date.UTC(2032, 0, 1) } as const;

export interface InstantRange {
  /** Inclusive lower bound in epoch milliseconds. */
  readonly min?: number;
  /** Inclusive upper bound in epoch milliseconds. */
  readonly max?: number;
}

/** Instants with millisecond precision in `range` (default {@link DEFAULT_INSTANT_RANGE}). */
export function arbInstant(range: InstantRange = {}): fc.Arbitrary<Instant> {
  const { min = DEFAULT_INSTANT_RANGE.min, max = DEFAULT_INSTANT_RANGE.max } = range;
  return fc.integer({ min, max }).map((epochMs) => instant(epochMs));
}

export function arbTenantId(): fc.Arbitrary<TenantId> {
  return fc.uuid().map((value) => tenantId(value));
}

export function arbUserId(): fc.Arbitrary<UserId> {
  return fc.uuid().map((value) => userId(value));
}

export function arbDepartmentId(): fc.Arbitrary<DepartmentId> {
  return fc.uuid().map((value) => departmentId(value));
}

export function arbTicketId(): fc.Arbitrary<TicketId> {
  return fc.uuid().map((value) => ticketId(value));
}
