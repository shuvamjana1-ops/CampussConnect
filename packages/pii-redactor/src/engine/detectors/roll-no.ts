import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { isAsciiAlnumAt, isAsciiDigitAt, isAsciiLetterCode, splitWords } from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

/**
 * Default enrolment-number pattern: a token of letters and digits (optionally split by "/" or "-") that
 * contains a letter–digit transition, such as "21BCE1234", "2021CS10123" or "1RV19CS001". Candidates are
 * kept when they have 6 to 20 letters and digits, at least two letters and at least three digits.
 */
const MIXED_TOKEN = new RE2(
  String.raw`(?:^|[^A-Za-z0-9])([A-Za-z0-9]*(?:[A-Za-z][/\-]?[0-9]|[0-9][/\-]?[A-Za-z])(?:[A-Za-z0-9]|[/\-][A-Za-z0-9])*)`,
  'g',
);

const MONTHS: ReadonlySet<string> = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
]);

/** "12-Jan-2024" or "Jan/2024": a month name with only numeric groups. */
function isDate(token: string): boolean {
  const groups = splitWords(token, 0, token.length, '/-').map((group) => group.text.toLowerCase());
  const monthGroups = groups.filter((group) => MONTHS.has(group)).length;
  return monthGroups === 1 && groups.every((group) => MONTHS.has(group) || isAllDigits(group));
}

function isAllDigits(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!isAsciiDigitAt(text, i)) {
      return false;
    }
  }
  return text !== '';
}

function looksLikeRollNumber(view: string, range: TextRange): boolean {
  if (isAsciiAlnumAt(view, range.end)) {
    return false;
  }
  let letters = 0;
  let digits = 0;
  for (let i = range.start; i < range.end; i += 1) {
    if (isAsciiDigitAt(view, i)) {
      digits += 1;
    } else if (isAsciiLetterCode(view.charCodeAt(i))) {
      letters += 1;
    }
  }
  const length = letters + digits;
  return length >= 6 && length <= 20 && letters >= 2 && digits >= 3 && !isDate(view.slice(range.start, range.end));
}

/** Compiles a Tenant-configured pattern. Throws a SyntaxError when it is not valid RE2 syntax. */
export function compileRollNumberPattern(source: string): RE2 {
  return new RE2(source, 'gi');
}

export function detectRollNumbers(view: string, tenantPatterns: readonly RE2[]): RedactionSpan[] {
  const ranges = [
    ...findAll(MIXED_TOKEN, view, { accept: (range) => looksLikeRollNumber(view, range) }),
    ...tenantPatterns.flatMap((pattern) => findAll(pattern, view, { wholeMatch: true })),
  ];
  return ranges.map((range) => ({ type: 'ROLL_NO', ...range }));
}
