import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { isAsciiAlnumAt, isAsciiDigitAt } from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

const NOT_ALNUM_BEFORE = String.raw`(?:^|[^A-Za-z0-9])`;

/** Aadhaar-shaped 12-digit groups, redacted whether or not the Verhoeff check digit is valid. */
const AADHAAR = new RE2(String.raw`(?:^|[^0-9])([0-9]{4}[ \-]?[0-9]{4}[ \-]?[0-9]{4})`, 'g');
/** PAN: five letters, four digits, one letter. */
const PAN = new RE2(String.raw`${NOT_ALNUM_BEFORE}([A-Za-z]{5}[0-9]{4}[A-Za-z])`, 'g');
/** Voter id (EPIC): three letters and seven digits. */
const VOTER_ID = new RE2(String.raw`${NOT_ALNUM_BEFORE}([A-Za-z]{3}[0-9]{7})`, 'g');
/** Indian passport: one letter and seven digits. */
const PASSPORT = new RE2(String.raw`${NOT_ALNUM_BEFORE}([A-Za-z][1-9][0-9]{6})`, 'g');
/** Driving licence: state code, RTO code, year of issue and a seven-digit number. */
const DRIVING_LICENCE = new RE2(
  String.raw`${NOT_ALNUM_BEFORE}([A-Za-z]{2}[ \-]?[0-9]{2}[ \-]?(?:19|20)[0-9]{2}[ \-]?[0-9]{7})`,
  'g',
);

export function detectGovernmentIds(view: string): RedactionSpan[] {
  const notFollowedByDigit = (range: TextRange): boolean => !isAsciiDigitAt(view, range.end);
  const notFollowedByAlnum = (range: TextRange): boolean => !isAsciiAlnumAt(view, range.end);
  const ranges = [
    ...findAll(AADHAAR, view, { accept: notFollowedByDigit }),
    ...findAll(PAN, view, { accept: notFollowedByAlnum }),
    ...findAll(VOTER_ID, view, { accept: notFollowedByAlnum }),
    ...findAll(PASSPORT, view, { accept: notFollowedByAlnum }),
    ...findAll(DRIVING_LICENCE, view, { accept: notFollowedByAlnum }),
  ];
  return ranges.map((range) => ({ type: 'GOV_ID', ...range }));
}
