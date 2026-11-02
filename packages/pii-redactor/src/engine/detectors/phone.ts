import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { isAsciiDigitAt } from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

const NOT_DIGIT_BEFORE = String.raw`(?:^|[^0-9+])`;
const SEP = String.raw`[ \-.]`;

/** Indian mobile: optional +91, 0091, 91 or 0 prefix, then 10 digits starting 6–9, with spaces, dashes or dots. */
const MOBILE = new RE2(
  String.raw`${NOT_DIGIT_BEFORE}((?:\(?(?:\+|00)\s?91\)?${SEP}*|91${SEP}?|0)?[6-9](?:${SEP}?[0-9]){9})`,
  'g',
);
/** Indian landline: STD code starting with 0, then the subscriber number; 10 or 11 digits in total. */
const LANDLINE = new RE2(
  String.raw`${NOT_DIGIT_BEFORE}(\(?0[1-9][0-9]{1,3}\)?[ \-]?[0-9]{2,4}[ \-]?[0-9]{2,4}(?:[ \-]?[0-9]{1,4})?)`,
  'g',
);
/** E.164-style international numbers: "+", country code and subscriber number, 8 to 15 digits. */
const INTERNATIONAL = new RE2(String.raw`${NOT_DIGIT_BEFORE}(\+[1-9](?:[ \-.]?\(?[0-9]\)?){6,14})`, 'g');

function digitCount(view: string, range: TextRange): number {
  let count = 0;
  for (let i = range.start; i < range.end; i += 1) {
    if (isAsciiDigitAt(view, i)) {
      count += 1;
    }
  }
  return count;
}

export function detectPhones(view: string): RedactionSpan[] {
  const notFollowedByDigit = (range: TextRange): boolean => !isAsciiDigitAt(view, range.end);
  const ranges = [
    ...findAll(MOBILE, view, { accept: notFollowedByDigit }),
    ...findAll(LANDLINE, view, {
      accept: (range) => notFollowedByDigit(range) && digitCount(view, range) >= 10 && digitCount(view, range) <= 11,
    }),
    ...findAll(INTERNATIONAL, view, { accept: (range) => notFollowedByDigit(range) && digitCount(view, range) >= 8 }),
  ];
  return ranges.map((range) => ({ type: 'PHONE', ...range }));
}
