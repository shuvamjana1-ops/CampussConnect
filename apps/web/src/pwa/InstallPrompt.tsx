import { Button } from '@campusconnect/ui';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  return /iPad|iPhone|iPod/.test(ua) && !standalone;
}

/** Offers install via `beforeinstallprompt`, and shows Add to Home Screen steps on iOS. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (dismissed) return null;
  if (deferred !== null) {
    return (
      <div role="region" aria-label="Install app">
        <span>Install CampusConnect on this device.</span>
        <Button
          onPress={() => {
            void deferred.prompt().then(() => { setDeferred(null); });
          }}
        >
          Install
        </Button>
        <Button variant="secondary" onPress={() => { setDismissed(true); }}>
          Not now
        </Button>
      </div>
    );
  }
  if (isIosSafari()) {
    return (
      <div role="region" aria-label="Install app">
        <span>To install: tap the Share button, then choose Add to Home Screen.</span>
        <Button variant="secondary" onPress={() => { setDismissed(true); }}>
          Dismiss
        </Button>
      </div>
    );
  }
  return null;
}
