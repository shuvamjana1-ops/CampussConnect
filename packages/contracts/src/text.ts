/**
 * Text measurement shared by the API and the PWA. Catalogue lengths are Unicode code points after NFC
 * normalisation, so Hindi and other non-Latin text is measured the same way on client and server.
 */

/** Options for {@link normaliseText} and {@link textLength}. */
export interface TextMeasureOptions {
  /** Remove leading and trailing whitespace (`String.prototype.trim`) after normalising. */
  readonly trim: boolean;
}

/** Number of Unicode code points in `value`, without normalising it. A lone surrogate counts as one code point. */
export function codePointLength(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
      }
    }
    count += 1;
  }
  return count;
}

/** Normalises text the way catalogue text fields do: NFC, then trimmed when `trim` is set. */
export function normaliseText(value: string, options: TextMeasureOptions): string {
  const normalised = value.normalize('NFC');
  return options.trim ? normalised.trim() : normalised;
}

/**
 * Length of `value` as the validation catalogue measures it: code points after NFC normalisation,
 * and after trimming when `trim` is set. Use it for character counters in forms.
 */
export function textLength(value: string, options: TextMeasureOptions = { trim: false }): number {
  return codePointLength(normaliseText(value, options));
}
