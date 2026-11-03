import { useI18n } from './I18nProvider';

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  return (
    <label className="cc-lang-label" title="Language: English">
      <span className="cc-visually-hidden">Language</span>
      <select
        value={locale}
        onChange={(e) => void setLocale(e.target.value)}
        className="cc-lang-select"
        aria-label="Language Selector"
      >
        <option value="en">English (EN)</option>
      </select>
    </label>
  );
}
