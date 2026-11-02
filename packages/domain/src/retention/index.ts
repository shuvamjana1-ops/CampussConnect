// @campusconnect/domain/retention: selection of items past their retention period.

export type RetentionItemType = string;

export interface RetentionItem {
  readonly id: string;
  readonly type: RetentionItemType;
  /** Creation time (audit entries, notifications) or the retention clock start. */
  readonly createdAt: Date;
  /** Explicit expiry; when absent it is derived from the type's policy. */
  readonly expiresAt?: Date | null;
  /** Set when a Student deleted a Document_Locker document. */
  readonly deletedAt?: Date | null;
}

export interface RetentionPolicy {
  readonly itemType: RetentionItemType;
  readonly retainDays: number;
  readonly action?: 'delete' | 'anonymise';
}

export const AUDIT_ENTRY_TYPE = 'audit_entry';
export const IN_APP_NOTIFICATION_TYPE = 'in_app_notification';
export const DOCUMENT_TYPE = 'document';

const DAY_MS = 86_400_000;
export const AUDIT_MIN_RETENTION_DAYS = 3 * 365;
export const NOTIFICATION_MIN_RETENTION_DAYS = 30;
export const DELETED_DOCUMENT_MAX_DAYS = 30;

function addDays(date: Date, days: number): number {
  return date.getTime() + days * DAY_MS;
}

/** Effective expiry (epoch ms) after applying floors and the deleted-document cap; null if none. */
export function effectiveExpiry(
  item: RetentionItem,
  policies: readonly RetentionPolicy[],
): number | null {
  let expiry: number | null = null;
  if (item.expiresAt) {
    expiry = item.expiresAt.getTime();
  } else {
    const policy = policies.find((p) => p.itemType === item.type);
    if (policy) expiry = addDays(item.createdAt, policy.retainDays);
  }

  if (item.type === AUDIT_ENTRY_TYPE) {
    const floor = addDays(item.createdAt, AUDIT_MIN_RETENTION_DAYS);
    expiry = expiry === null ? null : Math.max(expiry, floor);
  } else if (item.type === IN_APP_NOTIFICATION_TYPE) {
    const floor = addDays(item.createdAt, NOTIFICATION_MIN_RETENTION_DAYS);
    expiry = expiry === null ? null : Math.max(expiry, floor);
  } else if (item.type === DOCUMENT_TYPE && item.deletedAt) {
    const cap = addDays(item.deletedAt, DELETED_DOCUMENT_MAX_DAYS);
    expiry = expiry === null ? cap : Math.min(expiry, cap);
  }
  return expiry;
}

/** Pure selection of items whose effective expiry is at or before `now`. */
export function selectExpired<T extends RetentionItem>(
  items: readonly T[],
  policies: readonly RetentionPolicy[],
  now: Date,
): T[] {
  const nowMs = now.getTime();
  return items.filter((item) => {
    const expiry = effectiveExpiry(item, policies);
    return expiry !== null && expiry <= nowMs;
  });
}
