import type { ReactNode } from 'react';
import { useOnline } from './DraftStatus';

export const NEEDS_CONNECTION_MESSAGE = 'This action needs a connection. Your changes are kept.';

/** Banner shown while the device is offline. */
export function OfflineIndicator() {
  const online = useOnline();
  if (online) return null;
  return <div role="status">You are offline. Showing saved Tickets.</div>;
}

/**
 * Wraps a network-only action: offline it is disabled-by-guard and shows a "needs connection" message.
 * Form contents and stored data are untouched because the action is never invoked.
 */
export function NetworkOnlyAction({
  onAction,
  children,
}: {
  readonly onAction: () => void;
  readonly children: ReactNode;
}) {
  const online = useOnline();
  return (
    <>
      <button type="button" aria-disabled={!online} onClick={() => (online ? onAction() : undefined)}>
        {children}
      </button>
      {online ? null : <span role="alert">{NEEDS_CONNECTION_MESSAGE}</span>}
    </>
  );
}
