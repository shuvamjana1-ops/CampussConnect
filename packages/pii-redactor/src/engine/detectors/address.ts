import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import {
  DEVANAGARI_LETTER,
  isAsciiAlnumAt,
  isAsciiDigitAt,
  isDevanagariLetterAt,
  isDevanagariWord,
  isNumberWord,
  isStopword,
  splitWords,
} from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

/*
 * ADDRESS detection works on lines that contain a 6-digit PIN code or an address keyword. Instead of
 * redacting the whole line, which would also remove the substance of a complaint written on the same
 * line, each PIN code or keyword yields a fragment ("Flat 12", "Shanti Nagar", "Pune 411001"), and
 * fragments on the same line are joined when only short place-like words separate them.
 */

const CAP_WORD = String.raw`\p{Lu}[\p{L}\p{M}]*`;
const TITLE_WORD = String.raw`\p{Lu}[\p{Ll}\p{M}]+`;
const NUM_WORD = String.raw`[0-9]+[A-Za-z]{0,2}`;
const NOT_WORD_BEFORE = String.raw`(?:^|[^\p{L}\p{M}\p{N}])`;
const NOT_DEVANAGARI_BEFORE = '(?:^|[^\u0900-\u097F])';

/** Place keywords that are nearly always part of a locality name. */
const STRONG_PLACE = ['nagar', 'colony', 'vihar', 'enclave', 'puram', 'layout', 'mohalla', 'marg'];
/** Place keywords that need a capitalised or numbered word before them. */
const WEAK_PLACE = [
  'road', 'rd', 'street', 'st', 'lane', 'society', 'apartments', 'apartment', 'apts', 'apt', 'complex',
  'residency', 'chowk', 'gali', 'extension', 'village', 'vill', 'tehsil', 'district', 'dist', 'taluka',
];
const DEVANAGARI_PLACE = [
  'नगर', 'कॉलोनी', 'कालोनी', 'मार्ग', 'रोड', 'गली', 'मोहल्ला', 'विहार', 'पुरम', 'गांव', 'गाँव', 'ग्राम', 'जिला',
  'ज़िला', 'तहसील',
];
const PLACE_KEYWORDS: ReadonlySet<string> = new Set([...STRONG_PLACE, ...WEAK_PLACE, ...DEVANAGARI_PLACE]);

/** House, flat, plot or sector keyword followed by its number. */
const UNIT_KEYWORD = String.raw`(?i:house[ \t]*(?:no|number|num)|h[ \t]*\.?[ \t]*no|flat(?:[ \t]*no)?|plot(?:[ \t]*no)?|door[ \t]*no|d\.[ \t]*no|sector|qtr(?:[ \t]*no)?|quarter[ \t]*no)`;
const UNIT_IDENTIFIER = String.raw`(?:[0-9][A-Za-z0-9/\-]*|[A-Za-z][/\-]?[0-9][A-Za-z0-9/\-]*|[A-Z]\b)`;
const UNIT = new RE2(String.raw`(?:^|[^A-Za-z0-9])(${UNIT_KEYWORD}[ \t]*[.:#\-]?[ \t]*${UNIT_IDENTIFIER})`, 'g');
const DEVANAGARI_UNIT = new RE2(
  `${NOT_DEVANAGARI_BEFORE}((?:मकान|फ्लैट|फ़्लैट|प्लॉट|प्लाट|सेक्टर)(?:[ \\t]*(?:नंबर|नम्बर|नं|संख्या|क्रमांक)[.\u0970]?)?` +
    `[ \\t]*[.:#\\-]?[ \\t]*[0-9][A-Za-z0-9/\\-]*${DEVANAGARI_LETTER}*)`,
  'g',
);

/** One to three capitalised or numbered words, then a place keyword: "Shanti Nagar", "MG Road", "5th Main Rd". */
const PLACE = new RE2(
  String.raw`${NOT_WORD_BEFORE}((?:(?:${CAP_WORD}|${NUM_WORD})[ \t,]+){1,3}(?i:${[...STRONG_PLACE, ...WEAK_PLACE].join('|')})\b\.?)`,
  'g',
);
/** Any single word before a strong keyword, for text typed in lower case: "gandhi nagar". */
const LOWER_CASE_PLACE = new RE2(
  String.raw`${NOT_WORD_BEFORE}([\p{L}\p{M}]+[ \t]+(?i:${STRONG_PLACE.join('|')})\b)`,
  'g',
);
/** Keyword attached to the name: "Gandhinagar", "Indirapuram". */
const ATTACHED_PLACE = new RE2(String.raw`${NOT_WORD_BEFORE}(\p{L}+(?i:nagar|puram|vihar)\b)`, 'g');
/** Up to two Devanagari words, then a Devanagari place keyword: "शांति नगर", "गांधीनगर". */
const DEVANAGARI_PLACE_PATTERN = new RE2(
  `${NOT_DEVANAGARI_BEFORE}((?:${DEVANAGARI_LETTER}+[ \\t]+){0,2}${DEVANAGARI_LETTER}*(?:${DEVANAGARI_PLACE.join('|')}))`,
  'g',
);
/** Six-digit PIN code, optionally split 3 + 3, with up to two title-case place words before it. */
const PIN = new RE2(
  String.raw`(?:^|[^0-9])((?:${TITLE_WORD}[ \t]*[,\-]?[ \t]*){0,2}[1-9][0-9]{2} ?[0-9]{3})`,
  'g',
);

/** Drops leading stopwords and rejects a fragment that is only a place keyword. */
function trimPlace(view: string, range: TextRange): TextRange | undefined {
  const words = splitWords(view, range.start, range.end, ' \t,');
  const first = words.find((word) => !isStopword(word.text));
  if (first === undefined) {
    return undefined;
  }
  const rest = view.slice(first.start, range.end).toLowerCase();
  const bare = rest.endsWith('.') ? rest.slice(0, -1) : rest;
  return PLACE_KEYWORDS.has(bare) ? undefined : { start: first.start, end: range.end };
}

function trimTrailingSeparators(view: string, range: TextRange): TextRange {
  let end = range.end;
  while (end > range.start && (view.charAt(end - 1) === '-' || view.charAt(end - 1) === '/')) {
    end -= 1;
  }
  return { start: range.start, end };
}

/** True when a currency marker (₹, Rs, Rs., INR) directly precedes `index`. */
function currencyBefore(view: string, index: number): boolean {
  const before = view.slice(Math.max(0, index - 5), index).trimEnd().toLowerCase();
  return before.endsWith('₹') || before.endsWith('rs') || before.endsWith('rs.') || before.endsWith('inr');
}

function pinDigitsStart(view: string, end: number): number {
  return view.charAt(end - 4) === ' ' ? end - 7 : end - 6;
}

function isCapitalisedName(word: string): boolean {
  const first = word.charAt(0);
  if (first === first.toLowerCase()) {
    return false;
  }
  for (const char of word) {
    if (char.toLowerCase() === char.toUpperCase()) {
      return false;
    }
  }
  return true;
}

/** Text between two fragments on one line that is at most three place-like words. */
function isAddressGap(view: string, from: number, to: number): boolean {
  if (to - from > 40) {
    return false;
  }
  for (let i = from; i < to; i += 1) {
    const char = view.charAt(i);
    if (char === '\n' || char === '\r') {
      return false;
    }
  }
  const words = splitWords(view, from, to, ' \t,.-/#()');
  return (
    words.length <= 3 &&
    words.every(
      ({ text }) =>
        isNumberWord(text) || ((isCapitalisedName(text) || isDevanagariWord(text)) && !isStopword(text)),
    )
  );
}

function joinFragments(view: string, fragments: TextRange[]): TextRange[] {
  const sorted = [...fragments].sort((a, b) => a.start - b.start || b.end - a.end);
  const joined: TextRange[] = [];
  for (const fragment of sorted) {
    const last = joined.at(-1);
    if (last !== undefined && (fragment.start <= last.end || isAddressGap(view, last.end, fragment.start))) {
      joined[joined.length - 1] = { start: last.start, end: Math.max(last.end, fragment.end) };
    } else {
      joined.push(fragment);
    }
  }
  return joined;
}

export function detectAddresses(view: string): RedactionSpan[] {
  const fragments: TextRange[] = [];
  const add = (range: TextRange | undefined): void => {
    if (range !== undefined && range.end > range.start) {
      fragments.push(range);
    }
  };
  for (const range of findAll(UNIT, view, { accept: (r) => !isAsciiAlnumAt(view, r.end) })) {
    add(trimTrailingSeparators(view, range));
  }
  for (const range of findAll(DEVANAGARI_UNIT, view)) {
    add(trimTrailingSeparators(view, range));
  }
  for (const pattern of [PLACE, LOWER_CASE_PLACE, ATTACHED_PLACE]) {
    for (const range of findAll(pattern, view)) {
      add(trimPlace(view, range));
    }
  }
  for (const range of findAll(DEVANAGARI_PLACE_PATTERN, view, { accept: (r) => !isDevanagariLetterAt(view, r.end) })) {
    add(trimPlace(view, range));
  }
  const pins = findAll(PIN, view, {
    accept: (r) => !isAsciiDigitAt(view, r.end) && !currencyBefore(view, pinDigitsStart(view, r.end)),
  });
  for (const range of pins) {
    add(trimPlace(view, range));
  }
  return joinFragments(view, fragments).map((range) => ({ type: 'ADDRESS', ...range }));
}
