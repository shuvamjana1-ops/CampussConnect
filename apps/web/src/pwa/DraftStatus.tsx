import { useEffect, useState } from 'react';
import { listDrafts, subscribeDrafts, type Draft } from './draft-store';
import { retryDraft } from './sync-manager';

export function useDrafts(): Draft[] {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    let active = true;
    const load = (): void => {
      void listDrafts().then((next) => {
        if (active) setDrafts(next);
      });
    };
    load();
    const off = subscribeDrafts(load);
    return () => {
      active = false;
      off();
    };
  }, []);
  return drafts;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** "Queued for submission" badge while offline, and an error with a Retry button after 5 failed attempts. */
export function DraftStatus({ draftId }: { readonly draftId: string }) {
  const online = useOnline();
  const draft = useDrafts().find((d) => d.id === draftId);
  if (!draft) return null;
  if (draft.status === 'failed') {
    return (
      <div role="alert">
        <span>{draft.error ?? 'Submission failed'}</span>{' '}
        <button type="button" onClick={() => void retryDraft(draft.id)}>
          Retry
        </button>
      </div>
    );
  }
  if (!online && (draft.status === 'queued' || draft.status === 'submitting')) {
    return <span role="status">Queued for submission</span>;
  }
  return null;
}
