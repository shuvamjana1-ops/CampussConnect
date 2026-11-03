import { availableLocales, changeLocale, createI18n } from '@campusconnect/i18n';
import type { i18n } from 'i18next';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest } from '../api/client';
import { useSession } from '../auth/session';

interface I18nState {
  readonly locale: string;
  readonly t: (key: string) => string;
  readonly setLocale: (code: string) => Promise<void>;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [instance, setInstance] = useState<i18n | null>(null);
  const [locale, setLocaleState] = useState('en');
  const { session } = useSession();

  useEffect(() => {
    void createI18n().then((created) => {
      setInstance(created);
      setLocaleState(created.language);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Apply the profile's saved language once the session is known.
  const profileLocale = session?.locale ?? null;
  useEffect(() => {
    if (instance === null || profileLocale === null || profileLocale === instance.language) return;
    if (!availableLocales().some((l) => l.code === profileLocale)) return;
    void changeLocale(instance, profileLocale).then(() => { setLocaleState(profileLocale); });
  }, [instance, profileLocale]);

  const setLocale = useCallback(
    async (code: string) => {
      if (instance === null) return;
      await changeLocale(instance, code);
      setLocaleState(code);
      if (session !== null) {
        await apiRequest<unknown>('/me/profile', { method: 'PATCH', body: { locale: code } }).catch(
          () => undefined, // Local storage already holds the choice; the profile syncs next time.
        );
      }
    },
    [instance, session],
  );

  const value = useMemo<I18nState>(
    () => ({ locale, setLocale, t: (key) => (instance ? instance.t(key) : key) }),
    [instance, locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
