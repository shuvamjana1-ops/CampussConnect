import { describe, expect, it } from 'vitest';
import { compileRollNumberPattern } from '../src/engine/detectors/roll-no.ts';
import { buildGazetteerMatcher } from '../src/engine/gazetteer.ts';
import { mergeSpans, replaceSpans } from '../src/engine/merge.ts';
import { redactText, type TenantDetectors } from '../src/engine/redact-text.ts';

const tenant: TenantDetectors = {
  rollNumberPatterns: [compileRollNumberPattern(String.raw`\bVIT[0-9]{6}\b`)],
  gazetteer: buildGazetteerMatcher([
    { latin: 'Rahul Kumar Sharma', devanagari: 'राहुल कुमार शर्मा' },
    { latin: 'Priya Nair' },
  ]),
};

function redact(text: string): string {
  return redactText(text, tenant).text;
}

describe('detectors', () => {
  it.each([
    ['plain email', 'Mail me at rahul.sharma21@gmail.com today', 'Mail me at [PII:EMAIL] today'],
    ['obfuscated email', 'Contact rahul at gmail dot com please', 'Contact [PII:EMAIL] please'],
    ['mobile and landline', 'Call +91 98765 43210 or 011-23456789.', 'Call [PII:PHONE] or [PII:PHONE].'],
    ['Devanagari digits', 'फोन ९८७६५४३२१० है', 'फोन [PII:PHONE] है'],
    ['Aadhaar and PAN', 'Aadhaar 2345 6789 0123 and PAN ABCDE1234F', 'Aadhaar [PII:GOV_ID] and PAN [PII:GOV_ID]'],
    ['card and IFSC', 'Card 4111 1111 1111 1111, IFSC SBIN0001234', 'Card [PII:BANK_CARD], IFSC [PII:BANK_CARD]'],
    ['account number', 'account 123456789012345 blocked', 'account [PII:BANK_CARD] blocked'],
    [
      'default and Tenant roll numbers',
      'My roll number is 21BCE1234 and id VIT123456',
      'My roll number is [PII:ROLL_NO] and id [PII:ROLL_NO]',
    ],
    [
      'address with keywords and PIN code',
      'I live at Flat 12, Shanti Nagar, Pune 411001.\nThe hostel food is bad.',
      'I live at [PII:ADDRESS].\nThe hostel food is bad.',
    ],
    [
      'honorific and directory names in Latin and Devanagari',
      'Prof. Gupta and rahul sharma met राहुल कुमार शर्मा',
      'Prof. [PII:NAME] and [PII:NAME] met [PII:NAME]',
    ],
    ['Devanagari honorific', 'श्री मोहन लाल ने शिकायत की', 'श्री [PII:NAME] ने शिकायत की'],
  ])('redacts %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    'The road near the library is broken since 12-03-2024.',
    'MS Office crashed in Lab 3',
  ])('leaves text without PII unchanged: %s', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('reports spans with offsets in the original text', () => {
    const input = 'Call 9876543210 now';
    expect(redactText(input, tenant).spans).toEqual([{ type: 'PHONE', start: 5, end: 15 }]);
  });

  it('leaves existing placeholders unchanged and is idempotent', () => {
    expect(redact('[PII:NAME] called [PII:PHONE]')).toBe('[PII:NAME] called [PII:PHONE]');
    const once = redact('Prof. Gupta, rahul@gmail.com, Flat 12, Shanti Nagar, Pune 411001, 21BCE1234');
    expect(redact(once)).toBe(once);
  });
});

describe('mergeSpans', () => {
  it('covers the union of overlapping spans with the type of the longest span', () => {
    expect(
      mergeSpans([
        { type: 'NAME', start: 0, end: 5 },
        { type: 'ADDRESS', start: 3, end: 12 },
      ]),
    ).toEqual([{ type: 'ADDRESS', start: 0, end: 12 }]);
  });

  it('breaks length ties with the type priority', () => {
    expect(
      mergeSpans([
        { type: 'BANK_CARD', start: 0, end: 10 },
        { type: 'PHONE', start: 0, end: 10 },
      ]),
    ).toEqual([{ type: 'PHONE', start: 0, end: 10 }]);
  });

  it('keeps touching spans separate', () => {
    expect(
      mergeSpans([
        { type: 'EMAIL', start: 3, end: 6 },
        { type: 'NAME', start: 0, end: 3 },
      ]),
    ).toEqual([
      { type: 'NAME', start: 0, end: 3 },
      { type: 'EMAIL', start: 3, end: 6 },
    ]);
  });
});

describe('replaceSpans', () => {
  it('replaces spans with placeholders from right to left', () => {
    expect(
      replaceSpans('ab cd ef', [
        { type: 'NAME', start: 0, end: 2 },
        { type: 'PHONE', start: 6, end: 8 },
      ]),
    ).toBe('[PII:NAME] cd [PII:PHONE]');
  });

  it('rejects overlapping spans', () => {
    expect(() =>
      replaceSpans('abcdef', [
        { type: 'NAME', start: 0, end: 4 },
        { type: 'PHONE', start: 2, end: 6 },
      ]),
    ).toThrow(RangeError);
  });
});
