import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { isAsciiAlnumAt, isAsciiDigitAt, splitWords } from '../chars.ts';
import { findAll, type TextRange } from '../scan.ts';

/**
 * Runs of 9 or more digits, optionally grouped by single spaces or dashes. This covers 13–19 digit card
 * numbers and 9–18 digit account numbers, and deliberately over-redacts longer runs. A Luhn check is not
 * used: it would decide only whether to call the run a card, and both shapes are labelled BANK_CARD.
 */
const DIGIT_RUN = new RE2(String.raw`(?:^|[^0-9])([0-9](?:[ \-]?[0-9]){8,})`, 'g');
/** IFSC: four letters, a zero and six letters or digits. */
const IFSC = new RE2(String.raw`(?:^|[^A-Za-z0-9])([A-Za-z]{4}0[A-Za-z0-9]{6})`, 'g');

/** Dates followed by an hour ("2024-03-12 10", "12-03-2024 10") are not account numbers. */
function isDateWithHour(text: string): boolean {
  const groups = splitWords(text, 0, text.length, ' -');
  if (groups.length !== 4 || !text.includes('-')) {
    return false;
  }
  const lengths = groups.map((group) => group.text.length).join(',');
  return ['4,2,2,1', '4,2,2,2', '2,2,4,1', '2,2,4,2'].includes(lengths);
}

export function detectBankNumbers(view: string): RedactionSpan[] {
  const ranges = [
    ...findAll(DIGIT_RUN, view, {
      accept: (range: TextRange) =>
        !isAsciiDigitAt(view, range.end) && !isDateWithHour(view.slice(range.start, range.end)),
    }),
    ...findAll(IFSC, view, { accept: (range) => !isAsciiAlnumAt(view, range.end) }),
  ];
  return ranges.map((range) => ({ type: 'BANK_CARD', ...range }));
}
