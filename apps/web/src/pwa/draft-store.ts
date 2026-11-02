import { uuidv7 } from './uuidv7';

/** IndexedDB draft store. A draft keeps one idempotency key for its whole life, across every retry. */
export type DraftStatus = 'draft' | 'queued' | 'submitting' | 'failed';

export interface Draft {
  readonly id: string;
  /** API path the draft is submitted to (POST). */
  readonly endpoint: string;
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly status: DraftStatus;
  readonly attempts: number;
  readonly error?: string;
  readonly updatedAt: number;
}

export const SAVE_DEBOUNCE_MS = 1000;

const DB_NAME = 'campusconnect-drafts';
const STORE = 'drafts';
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

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = op(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to any draft change (same tab). Returns the unsubscribe function. */
export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getDraft(id: string): Promise<Draft | undefined> {
  return (await run<Draft | undefined>('readonly', (s) => s.get(id))) ?? undefined;
}

export async function listDrafts(): Promise<Draft[]> {
  const all = await run<Draft[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function putDraft(draft: Draft): Promise<void> {
  await run('readwrite', (s) => s.put(draft));
  notify();
}

export async function deleteDraft(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  notify();
}

/** Creates or updates a draft's payload; the idempotency key is generated once and never changes. */
export async function saveDraft(id: string, endpoint: string, payload: unknown): Promise<Draft> {
  const existing = await getDraft(id);
  const draft: Draft = {
    id,
    endpoint,
    payload,
    idempotencyKey: existing?.idempotencyKey ?? uuidv7(),
    status: existing?.status === 'queued' || existing?.status === 'failed' ? existing.status : 'draft',
    attempts: existing?.attempts ?? 0,
    ...(existing?.error === undefined ? {} : { error: existing.error }),
    updatedAt: Date.now(),
  };
  await putDraft(draft);
  return draft;
}

/** Debounced saver: persists 1 second after the last change. `flush` saves immediately. */
export function createDebouncedSaver(
  id: string,
  endpoint: string,
  delayMs: number = SAVE_DEBOUNCE_MS,
): { change(payload: unknown): void; flush(): Promise<void>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: unknown } | undefined;
  const flush = async (): Promise<void> => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const next = pending;
    pending = undefined;
    if (next) await saveDraft(id, endpoint, next.value);
  };
  return {
    change(payload) {
      pending = { value: payload };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    flush,
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}
