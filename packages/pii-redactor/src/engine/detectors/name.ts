import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { DEVANAGARI_LETTER, isStopword, splitWords } from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

/*
 * Honorific patterns: Mr, Ms, Dr, Prof, Shri, Smt, Kumari (and common variants) followed by capitalised
 * words, and their Devanagari forms followed by one or two words. The honorific itself stays in the text
 * so classification keeps the role ("Prof. [PII:NAME]"). Directory names are matched by the gazetteer.
 */

/** Case variants are listed explicitly so that "MS Office" is not treated as an honorific. */
const LATIN_HONORIFIC = [
  'Mrs', 'MRS', 'mrs', 'Mr', 'MR', 'mr', 'Ms', 'ms', 'Miss', 'MISS', 'Mx', 'Dr', 'DR', 'dr',
  'Professor', 'PROFESSOR', 'professor', 'Prof', 'PROF', 'prof', 'Shree', 'Shri', 'SHRI', 'shri', 'Sri', 'SRI',
  'sri', 'Smt', 'SMT', 'smt', 'Kumari', 'KUMARI', 'kumari',
].join('|');
const LATIN_NAME_WORD = String.raw`\p{Lu}[\p{L}\p{M}'’\-]*`;
const LATIN_NAME = String.raw`(?:\p{Lu}\.[ \t]*){0,3}${LATIN_NAME_WORD}(?:[ \t]+${LATIN_NAME_WORD}){0,2}`;
const LATIN = new RE2(String.raw`(?:^|[^A-Za-z0-9])(?:${LATIN_HONORIFIC})(?:\.[ \t]*|[ \t]+)(${LATIN_NAME})`, 'g');

const DEVANAGARI_HONORIFIC = ['श्रीमती', 'सुश्री', 'श्री', 'कुमारी', 'डॉक्टर', 'डॉ', 'डा', 'प्रोफ़ेसर', 'प्रोफेसर', 'प्रो'].join('|');
const DEVANAGARI = new RE2(
  `(?:^|[^\u0900-\u097F])(?:${DEVANAGARI_HONORIFIC})(?:[.\u0970][ \\t]*|[ \\t]+)` +
    `(${DEVANAGARI_LETTER}+(?:[ \\t]+${DEVANAGARI_LETTER}+)?)`,
  'g',
);

/** Words that name a building or place after a person's name: "Dr. Ambedkar Hostel". */
const FACILITY_WORDS: ReadonlySet<string> = new Set([
  'hostel', 'hall', 'block', 'building', 'bhawan', 'bhavan', 'library', 'auditorium', 'institute', 'college',
  'university', 'school', 'road', 'marg', 'nagar', 'stadium', 'centre', 'center', 'hospital', 'lab',
  'laboratory', 'mess', 'canteen', 'department', 'dept', 'memorial', 'park', 'chowk', 'colony', 'street',
  'lane', 'campus', 'complex', 'ground', 'gate', 'chair', 'scholarship', 'award', 'trust',
]);

/** Keeps the name words before the first facility word; drops a leading stopword match. */
function trimLatinName(view: string, range: TextRange): TextRange | undefined {
  const words = splitWords(view, range.start, range.end, ' \t');
  let end = range.start;
  for (const word of words) {
    if (FACILITY_WORDS.has(word.text.toLowerCase()) || (end === range.start && isStopword(word.text))) {
      break;
    }
    end = word.end;
  }
  return end > range.start ? { start: range.start, end } : undefined;
}

/** Keeps one word when the second Devanagari word is a postposition or particle ("श्री राम ने"). */
function trimDevanagariName(view: string, range: TextRange): TextRange | undefined {
  const [first, second] = splitWords(view, range.start, range.end, ' \t');
  if (first === undefined || isStopword(first.text)) {
    return undefined;
  }
  return second === undefined || isStopword(second.text) ? { start: first.start, end: first.end } : range;
}

export function detectHonorificNames(view: string): RedactionSpan[] {
  const ranges = [
    ...findAll(LATIN, view).map((range) => trimLatinName(view, range)),
    ...findAll(DEVANAGARI, view).map((range) => trimDevanagariName(view, range)),
  ];
  return ranges
    .filter((range): range is TextRange => range !== undefined)
    .map((range) => ({ type: 'NAME', ...range }));
}
