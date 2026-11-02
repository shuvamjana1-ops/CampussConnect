import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ApiProvider } from './api/query';
import { SessionProvider } from './auth/session';
import { I18nProvider } from './i18n/I18nProvider';
import { registerServiceWorker } from './pwa/register';
import { startSyncManager } from './pwa/sync-manager';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ApiProvider>
      <SessionProvider>
        <I18nProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nProvider>
      </SessionProvider>
    </ApiProvider>
  </StrictMode>,
);

registerServiceWorker();
startSyncManager();
