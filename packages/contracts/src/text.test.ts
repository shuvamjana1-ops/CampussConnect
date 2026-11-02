import { describe, expect, it } from 'vitest';

import { codePointLength, normaliseText, textLength } from './text';

describe('codePointLength', () => {
  it('counts code points rather than UTF-16 code units', () => {
    expect(codePointLength('')).toBe(0);
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('😀')).toBe(1);
    expect(codePointLength('नमस्ते')).toBe(6);
  });

  it('counts a lone surrogate as one code point', () => {
    expect(codePointLength('\ud800')).toBe(1);
    expect(codePointLength('😀\ud800x')).toBe(3);
  });
});

describe('textLength', () => {
  it('measures after NFC normalisation', () => {
    expect(textLength('e\u0301')).toBe(1);
    // U+0958 is a composition exclusion, so NFC keeps it decomposed into two code points.
    expect(textLength('\u0958')).toBe(2);
  });

  it('trims only when asked', () => {
    expect(textLength('  ab  ')).toBe(6);
    expect(textLength('  ab  ', { trim: true })).toBe(2);
    expect(normaliseText('  e\u0301 ', { trim: true })).toBe('\u00e9');
  });
});
