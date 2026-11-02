// @campusconnect/domain/workbench: Staff_Workbench queue ordering.

export type QueueBand = 'P0' | 'P1' | 'P2' | 'P3';

export interface QueueItem {
  readonly id: string;
  readonly band: QueueBand;
  /** Next SLA due time (ms since epoch); null when none. */
  readonly sortDueAt: number | null;
  readonly paused: boolean;
  /** Creation time (ms since epoch). */
  readonly createdAt: number;
}

export const QUEUE_PAGE_SIZE = 50;

const BAND_RANK: Readonly<Record<QueueBand, number>> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Band P0..P3, then sortDueAt ascending (paused last in band), then createdAt, then id. */
export function queueOrder(a: QueueItem, b: QueueItem): number {
  const band = BAND_RANK[a.band] - BAND_RANK[b.band];
  if (band !== 0) return band;
  if (a.paused !== b.paused) return a.paused ? 1 : -1;
  const aDue = a.sortDueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.sortDueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Returns the first page (default 50) of items in queue order, without mutating input. */
export function firstQueuePage<T extends QueueItem>(
  items: readonly T[],
  pageSize: number = QUEUE_PAGE_SIZE,
): T[] {
  return [...items].sort(queueOrder).slice(0, pageSize);
}
