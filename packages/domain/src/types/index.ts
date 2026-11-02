// @campusconnect/domain/types: branded ids and Instant shared by every domain module.

declare const brand: unique symbol;

/** A `T` that type-checks only where a value of the same brand is expected. Create values with the constructors below. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type DepartmentId = Brand<string, 'DepartmentId'>;
export type TicketId = Brand<string, 'TicketId'>;

/**
 * A point in time, as whole milliseconds since 1970-01-01T00:00:00Z.
 * Instants carry no time zone; a zone applies only when an instant is compared with a local calendar.
 */
export type Instant = Brand<number, 'Instant'>;

/** The largest distance from the epoch that an ECMAScript `Date` can represent, in milliseconds. */
const MAX_EPOCH_MS = 8.64e15;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Primary keys are UUIDs (UUIDv7 in practice). Ids are lower-cased so that equal ids compare equal. */
function uuid(value: string, kind: string): string {
  if (!UUID.test(value)) {
    throw new RangeError(`${kind} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function tenantId(value: string): TenantId {
  return uuid(value, 'TenantId') as TenantId;
}

export function userId(value: string): UserId {
  return uuid(value, 'UserId') as UserId;
}

export function departmentId(value: string): DepartmentId {
  return uuid(value, 'DepartmentId') as DepartmentId;
}

export function ticketId(value: string): TicketId {
  return uuid(value, 'TicketId') as TicketId;
}

/** Brands epoch milliseconds as an Instant. Rejects fractions, NaN, infinities and values outside the `Date` range. */
export function instant(epochMs: number): Instant {
  if (!Number.isInteger(epochMs) || Math.abs(epochMs) > MAX_EPOCH_MS) {
    throw new RangeError('An Instant must be a whole number of milliseconds within the Date range.');
  }
  return epochMs as Instant;
}
