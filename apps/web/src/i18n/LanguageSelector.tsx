import { availableLocales } from '@campusconnect/i18n';
import { useI18n } from './I18nProvider';

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  return (
    <label>
      <span className="cc-visually-hidden">Language</span>
      <select value={locale} onChange={(e) => void setLocale(e.target.value)}>
        {availableLocales().map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
