/** Character tests and shared pattern fragments for the detectors. */

/**
 * RE2 character class for one Devanagari letter or combining mark (U+0900–U+0963, U+0971–U+097F), plus
 * ZWNJ and ZWJ. Dandas, Devanagari digits and the abbreviation sign are excluded. Built with JavaScript
 * escapes so RE2 receives the literal characters.
 */
export const DEVANAGARI_LETTER = '[\u0900-\u0963\u0971-\u097F\u200C\u200D]';

export function isAsciiDigitAt(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code >= 0x30 && code <= 0x39;
}

export function isAsciiLetterCode(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

export function isAsciiAlnumAt(text: string, index: number): boolean {
  return isAsciiDigitAt(text, index) || isAsciiLetterCode(text.charCodeAt(index));
}

export function isDevanagariLetterCode(code: number): boolean {
  return (code >= 0x0900 && code <= 0x0963) || (code >= 0x0971 && code <= 0x097f) || code === 0x200c || code === 0x200d;
}

export function isDevanagariLetterAt(text: string, index: number): boolean {
  return isDevanagariLetterCode(text.charCodeAt(index));
}

export function isDevanagariWord(word: string): boolean {
  if (word === '') {
    return false;
  }
  for (let i = 0; i < word.length; i += 1) {
    if (!isDevanagariLetterCode(word.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

/** Digits followed by at most two ASCII letters, for example "12", "5th" or "3B". */
export function isNumberWord(word: string): boolean {
  let i = 0;
  while (i < word.length && isAsciiDigitAt(word, i)) {
    i += 1;
  }
  if (i === 0 || word.length - i > 2) {
    return false;
  }
  for (; i < word.length; i += 1) {
    if (!isAsciiLetterCode(word.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

export interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Splits `text[from, to)` into words separated by any character in `separators`. Offsets are absolute. */
export function splitWords(text: string, from: number, to: number, separators: string): Word[] {
  const words: Word[] = [];
  let start = -1;
  for (let i = from; i <= to; i += 1) {
    const isSeparator = i === to || separators.includes(text.charAt(i));
    if (isSeparator) {
      if (start >= 0) {
        words.push({ text: text.slice(start, i), start, end: i });
        start = -1;
      }
    } else if (start < 0) {
      start = i;
    }
  }
  return words;
}

/**
 * Words that are capitalised at the start of a sentence or in letters but are not part of a place or
 * person name. Detectors drop them from the start of ADDRESS and NAME candidates. Latin entries are
 * lower case and compared case-insensitively.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'our', 'your', 'his', 'her', 'their', 'its',
  'i', 'we', 'he', 'she', 'they', 'it', 'you', 'every', 'each', 'any', 'some', 'no', 'yes', 'dear',
  'respected', 'sir', 'madam', 'hello', 'hi', 'please', 'kindly', 'on', 'in', 'at', 'near', 'from', 'to',
  'of', 'and', 'or', 'but', 'with', 'opposite', 'opp', 'behind', 'beside', 'via',
  'मैं', 'मेरा', 'मेरी', 'मेरे', 'हम', 'हमारा', 'हमारी', 'हमारे', 'यह', 'वह', 'ये', 'वो', 'में', 'से', 'को',
  'का', 'की', 'के', 'पर', 'और', 'ने', 'जी', 'है', 'हैं', 'था', 'थे', 'थी', 'पास', 'मे',
]);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}
