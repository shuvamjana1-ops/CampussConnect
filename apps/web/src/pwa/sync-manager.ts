import { ApiError, apiRequest } from '../api/client';
import { deleteDraft, getDraft, listDrafts, putDraft, type Draft } from './draft-store';

/** First attempt immediately, then retries after 5, 15, 30 and 60 seconds: 5 attempts in total. */
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
export const SYNC_TAG = 'campusconnect-drafts';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Submission failed';
}

/** 4xx other than 408/429 will not succeed on retry unchanged, but the spec retries all failures. */
async function attempt(id: string): Promise<void> {
  if (inFlight.has(id)) return;
  const draft = await getDraft(id);
  if (!draft || draft.status === 'draft') return;
  inFlight.add(id);
  clearTimer(id);
  const attempts = (draft.attempts ?? 0) + 1;
  try {
    await putDraft({ ...draft, status: 'submitting', attempts });
    await apiRequest(draft.endpoint ?? '/tickets', {
      method: 'POST',
      body: draft.payload,
      headers: { 'Idempotency-Key': draft.idempotencyKey ?? draft.id },
    });
    await deleteDraft(id);
  } catch (error) {
    if (attempts >= MAX_ATTEMPTS) {
      await putDraft({ ...draft, status: 'failed', attempts, error: describe(error) });
    } else {
      await putDraft({ ...draft, status: 'queued', attempts, error: describe(error) });
      const delay = RETRY_DELAYS_MS[attempts - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 60_000;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void attempt(id);
        }, delay),
      );
    }
    if (error instanceof ApiError && error.status === 401) clearTimer(id);
  } finally {
    inFlight.delete(id);
  }
}

/** Marks a draft for submission and makes the first attempt immediately (or on reconnect if offline). */
export async function submitDraft(id: string): Promise<void> {
  const draft = await getDraft(id);
  if (!draft) return;
  const queued: Draft = { ...draft, status: 'queued', attempts: 0 };
  await putDraft(queued);
  await requestBackgroundSync();
  if (navigator.onLine) await attempt(id);
}

/** Retry button: restarts the schedule for a failed draft, reusing its idempotency key. */
export async function retryDraft(id: string): Promise<void> {
  const draft = await getDraft(id);
  if (draft?.status !== 'failed') return;
  await submitDraft(id);
}

/** Attempts every queued draft that has no pending retry timer. Failed drafts wait for Retry. */
export async function flushQueue(): Promise<void> {
  if (!navigator.onLine) return;
  const drafts = await listDrafts();
  await Promise.all(
    drafts
      .filter((d) => (d.status === 'queued' || d.status === 'submitting') && !timers.has(d.id))
      .map((d) => attempt(d.id)),
  );
}

async function requestBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync;
    await sync?.register(SYNC_TAG);
  } catch {
    // Background Sync is optional; online and focus triggers still apply.
  }
}

/** Wires the online, focus, visibility and service-worker Background Sync triggers. Returns a disposer. */
export function startSyncManager(): () => void {
  const trigger = (): void => {
    void flushQueue();
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') trigger();
  };
  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { type?: string } | null;
    if (data?.type === 'sync-drafts') trigger();
  };
  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker.addEventListener('message', onMessage);
  trigger();
  return () => {
    window.removeEventListener('online', trigger);
    window.removeEventListener('focus', trigger);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker.removeEventListener('message', onMessage);
    for (const id of [...timers.keys()]) clearTimer(id);
  };
}
