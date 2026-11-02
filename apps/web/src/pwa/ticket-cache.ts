/** IndexedDB offline Ticket cache: keeps the 50 most recently viewed Tickets (least-recently-viewed eviction). */
export const MAX_CACHED_TICKETS = 50;

export interface CachedTicket {
  readonly id: string;
  readonly data: unknown;
  /** The Ticket's last update time as reported by the server (epoch ms). */
  readonly lastUpdatedAt: number;
  /** When the Ticket was last viewed (epoch ms); drives eviction. */
  readonly viewedAt: number;
}

const DB_NAME = 'campusconnect-tickets';
const STORE = 'tickets';
const listeners = new Set<() => void>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    const result = await op(tx.objectStore(STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Subscribes to cache changes (same tab). Returns the unsubscribe function. */
export function subscribeTicketCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Stores a viewed Ticket and evicts the least recently viewed beyond the limit. */
export async function cacheTicket(id: string, data: unknown, lastUpdatedAt: number): Promise<void> {
  await withStore('readwrite', async (store) => {
    await req(store.put({ id, data, lastUpdatedAt, viewedAt: Date.now() } satisfies CachedTicket));
    const all = await req<CachedTicket[]>(store.getAll());
    if (all.length <= MAX_CACHED_TICKETS) return;
    all.sort((a, b) => b.viewedAt - a.viewedAt);
    for (const stale of all.slice(MAX_CACHED_TICKETS)) await req(store.delete(stale.id));
  });
  notify();
}

/** Reads a cached Ticket and marks it as most recently viewed. */
export async function getCachedTicket(id: string): Promise<CachedTicket | undefined> {
  const found = await withStore('readwrite', async (store) => {
    const entry = await req<CachedTicket | undefined>(store.get(id));
    if (!entry) return undefined;
    const touched: CachedTicket = { ...entry, viewedAt: Date.now() };
    await req(store.put(touched));
    return touched;
  });
  if (found) notify();
  return found;
}

/** Cached Tickets, most recently viewed first. */
export async function listCachedTickets(): Promise<CachedTicket[]> {
  const all = await withStore('readonly', (store) => req<CachedTicket[]>(store.getAll()));
  return all.sort((a, b) => b.viewedAt - a.viewedAt);
}
