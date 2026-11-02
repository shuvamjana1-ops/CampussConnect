import type RE2 from 're2';

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export interface FindAllOptions {
  /** Report the whole match even when the pattern has capture groups (used for Tenant patterns). */
  readonly wholeMatch?: boolean | undefined;
  /** Rejects a range. Scanning then resumes one code point after the range start. */
  readonly accept?: ((range: TextRange) => boolean) | undefined;
}

/**
 * Finds every match of a global RE2 pattern in `text`.
 *
 * RE2 has no lookbehind or lookahead. Built-in patterns therefore consume one boundary character before
 * the PII value and capture the value in group 1, which must be a suffix of the whole match; trailing
 * boundaries are checked by `accept`.
 */
export function findAll(pattern: RE2, text: string, options: FindAllOptions = {}): TextRange[] {
  const ranges: TextRange[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const whole = match[0];
    const end = match.index + whole.length;
    const value = options.wholeMatch === true ? whole : (match[1] ?? whole);
    const range: TextRange = { start: end - value.length, end };
    if (range.end > range.start && (options.accept === undefined || options.accept(range))) {
      ranges.push(range);
    } else {
      pattern.lastIndex = nextCodePoint(text, Math.max(range.start, match.index));
    }
  }
  return ranges;
}

function nextCodePoint(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff ? index + 2 : index + 1;
}
