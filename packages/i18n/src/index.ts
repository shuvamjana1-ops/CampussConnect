// @campusconnect/i18n: English and Hindi resources and the locale manifest.
import i18next, { type i18n, type Resource } from 'i18next';
import manifestJson from '../locales/manifest.json';

export interface LocaleEntry {
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
}

export interface LocaleManifest {
  readonly defaultLocale: string;
  readonly locales: readonly LocaleEntry[];
}

export const FALLBACK_LOCALE = 'en';
export const DEFAULT_NAMESPACE = 'common';
export const LOCALE_STORAGE_KEY = 'campusconnect.locale';

export const localeManifest: LocaleManifest = manifestJson;

/** Bundles every `locales/{code}/{namespace}.json`; a new locale folder needs no code change. */
function loadBundledResources(): Resource {
  let files: Record<string, unknown> = {};
  try {
    files = import.meta.glob('../locales/*/*.json', {
      eager: true,
      import: 'default',
    });
  } catch {
    files = {};
  }
  const resources: Record<string, Record<string, Record<string, string>>> = {};
  for (const [path, content] of Object.entries(files ?? {})) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    const code = match?.[1];
    const namespace = match?.[2];
    if (code === undefined || namespace === undefined) continue;
    (resources[code] ??= {})[namespace] = content as Record<string, string>;
  }
  return Object.fromEntries(
    Object.entries(resources).map(([code, namespaces]) => [
      code,
      Object.fromEntries(Object.entries(namespaces)),
    ]),
  );
}

export const bundledResources: Resource = loadBundledResources();

/** Locales offered in the selector: the manifest plus any bundled locale not yet listed. */
export function availableLocales(
  manifest: LocaleManifest = localeManifest,
  resources: Resource = bundledResources,
): readonly LocaleEntry[] {
  const listed = new Set(manifest.locales.map((l) => l.code));
  const extra = Object.keys(resources)
    .filter((code) => !listed.has(code))
    .map((code) => ({ code, name: code, nativeName: code }));
  return [...manifest.locales, ...extra].filter((l) => l.code in resources);
}

export function isSupportedLocale(code: string | null | undefined): code is string {
  return code !== null && code !== undefined && availableLocales().some((l) => l.code === code);
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | undefined {
  try {
    return (globalThis as { localStorage?: KeyValueStore }).localStorage;
  } catch {
    return undefined;
  }
}

export function readPersistedLocale(store: KeyValueStore | undefined = defaultStore()): string {
  try {
    const stored = store?.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // Storage unavailable: use the default locale.
  }
  return localeManifest.defaultLocale;
}

export function persistLocale(
  code: string,
  store: KeyValueStore | undefined = defaultStore(),
): void {
  try {
    store?.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // Storage unavailable: the selection applies to this session only.
  }
}

export interface CreateI18nOptions {
  readonly locale?: string;
  readonly resources?: Resource;
  readonly store?: KeyValueStore | undefined;
}

/** Creates an isolated i18next instance; missing keys fall back to English. */
export async function createI18n(options: CreateI18nOptions = {}): Promise<i18n> {
  const instance = i18next.createInstance();
  const resources = options.resources ?? bundledResources;
  await instance.init({
    resources,
    lng: options.locale ?? readPersistedLocale(options.store),
    fallbackLng: FALLBACK_LOCALE,
    ns: Object.keys(resources[FALLBACK_LOCALE] ?? { [DEFAULT_NAMESPACE]: {} }),
    defaultNS: DEFAULT_NAMESPACE,
    keySeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

/** Switches language and persists the choice across sessions. */
export async function changeLocale(
  instance: i18n,
  code: string,
  store: KeyValueStore | undefined = defaultStore(),
): Promise<void> {
  await instance.changeLanguage(code);
  persistLocale(code, store);
}
