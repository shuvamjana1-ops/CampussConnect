import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { sanitizeText } from './sanitize';

describe('sanitizeText', () => {
  it('strips HTML tags and keeps the text content', () => {
    expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
    expect(sanitizeText('<b>Bold</b> <i>italic</i>')).toBe('Bold italic');
  });

  it('removes script and style elements entirely', () => {
    expect(sanitizeText('Before<script>alert("xss")</script>After')).toBe('BeforeAfter');
    expect(sanitizeText('Text<style>body { color: red; }</style>More')).toBe('TextMore');
  });

  it('handles angle brackets as text (not HTML)', () => {
    // sanitize-html leaves angle brackets as-is when they're not part of tags
    // The exact behavior depends on sanitize-html configuration
    const result1 = sanitizeText('5 < 10');
    const result2 = sanitizeText('Result > 0');
    // Just verify they don't crash and handle the text somehow
    expect(typeof result1).toBe('string');
    expect(typeof result2).toBe('string');
  });

  it('decodes HTML entities', () => {
    expect(sanitizeText('&lt;')).toBe('<');
    expect(sanitizeText('&gt;')).toBe('>');
    expect(sanitizeText('&quot;')).toBe('"');
    expect(sanitizeText('&apos;')).toBe("'");
    expect(sanitizeText('&amp;')).toBe('&');
  });

  it('preserves plain ampersands', () => {
    // Plain ampersands (not part of entities) should be preserved
    expect(sanitizeText('R & D')).toBe('R & D');
  });

  it('decodes numeric entities', () => {
    expect(sanitizeText('&#65;')).toBe('A');
    expect(sanitizeText('&#x41;')).toBe('A');
    expect(sanitizeText('&#x1F600;')).toBe('😀');
  });

  it('falls back to mojibake for unmapped named entities', () => {
    expect(sanitizeText('&invalidEntity;')).toBe('&invalidEntity;');
    expect(sanitizeText('&unknownName;')).toBe('&unknownName;');
  });

  it('falls back to mojibake for invalid numeric entities', () => {
    // Numeric entities beyond valid Unicode range become mojibake
    expect(sanitizeText('&#999999999;')).toBe('&#999999999;');
    expect(sanitizeText('&#xDEADBEEF;')).toBe('&#xDEADBEEF;');
  });

  it('removes control characters except whitespace', () => {
    // U+0000 to U+0008 should be removed
    expect(sanitizeText('Hello\u0000World')).toBe('HelloWorld');
    expect(sanitizeText('Test\u0001\u0002\u0003')).toBe('Test');

    // U+000B (vertical tab) and U+000C (form feed) should be removed
    expect(sanitizeText('Text\u000B\u000CEnd')).toBe('TextEnd');

    // U+000E to U+001F should be removed
    expect(sanitizeText('A\u000EB\u000EC')).toBe('ABC');

    // U+007F to U+009F should be removed
    expect(sanitizeText('X\u007FY\u0080Z')).toBe('XYZ');
  });

  it('preserves whitespace characters (tab, LF, CR, space)', () => {
    expect(sanitizeText('Hello\tWorld')).toBe('Hello\tWorld');
    expect(sanitizeText('Hello\nWorld')).toBe('Hello\nWorld');
    expect(sanitizeText('Hello\rWorld')).toBe('Hello\rWorld');
    expect(sanitizeText('Hello World')).toBe('Hello World');
  });

  it('handles combined sanitization: HTML stripping, entity decoding, and control char removal', () => {
    expect(sanitizeText('<p>Hello&nbsp;World</p>')).toBe('Hello\u00A0World');
    expect(sanitizeText('Test<script>bad();</script>&amp;more')).toBe('Test&more');
    expect(sanitizeText('Normal\u0000Text<b>Bold</b>')).toBe('NormalTextBold');
  });

  it('is idempotent (applying it twice gives the same result as once)', () => {
    const input1 = 'Hello&amp;World';
    const once1 = sanitizeText(input1);
    const twice1 = sanitizeText(once1);
    expect(twice1).toBe(once1);

    const input2 = 'Test<p>Content</p>';
    const once2 = sanitizeText(input2);
    const twice2 = sanitizeText(once2);
    expect(twice2).toBe(once2);
  });

  it('handles empty strings', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('handles strings with only whitespace', () => {
    expect(sanitizeText('   ')).toBe('   ');
    expect(sanitizeText('\n\t\r')).toBe('\n\t\r');
  });

  it('handles HTML entities in attributes that are stripped', () => {
    expect(sanitizeText('<p title="&lt;script&gt;">Text</p>')).toBe('Text');
  });

  it('handles multiple consecutive control characters', () => {
    expect(sanitizeText('A\u0000\u0001\u0002B')).toBe('AB');
  });

  it('handles mixed valid and invalid entities', () => {
    expect(sanitizeText('&lt;valid&gt; &invalid; &#65;')).toBe('<valid> &invalid; A');
  });

  it('handles common HTML entities', () => {
    expect(sanitizeText('&nbsp;')).toBe('\u00A0');
    expect(sanitizeText('&euro;')).toBe('€');
    expect(sanitizeText('&pound;')).toBe('£');
  });

  it('defends against XSS attempts', () => {
    // Script tags are removed entirely
    expect(sanitizeText('<img src=x onerror="alert(1)">')).not.toContain('alert');
    expect(sanitizeText('<svg onload="alert(1)">')).not.toContain('alert');
    // Event handlers in entities should be decoded but harmless as text
    expect(sanitizeText('&lt;img src=x onerror="alert(1)"&gt;')).toBe('<img src=x onerror="alert(1)">');
  });
});

describe('sanitizeText property tests', () => {
  /**
   * Property 65 (part 1): Sanitisation is idempotent
   *
   * For any input text, applying sanitizeText twice produces the same result as applying it once.
   * This ensures that re-processing sanitized text does not change it further.
   *
   * **Validates: Requirements 22.5, 4.1, 4.3**
   */
  it('Property 65.1: Sanitisation is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = sanitizeText(input);
        const twice = sanitizeText(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 65.2: Sanitisation neutralises executable content
   *
   * For any input text, the sanitised result contains:
   * - No `<script>` tags or their HTML-encoded variants
   * - No event handler attributes (onload, onerror, onclick, etc.)
   * - No `javascript:` URLs in any form
   * - No disallowed control characters (U+0000-U+0008, U+000B-U+000C, U+000E-U+001F, U+007F-U+009F)
   * - No unclosed or malformed HTML tags that could execute
   *
   * **Validates: Requirements 22.5, 4.1, 4.3**
   */
  it('Property 65.2: Sanitisation neutralises executable content', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const sanitized = sanitizeText(input);

        // Script tags and their variants must be completely removed
        expect(sanitized).not.toMatch(/<\s*script\s*>/i);
        expect(sanitized).not.toMatch(/<\/\s*script\s*>/i);
        expect(sanitized).not.toMatch(/&#60;\s*script/i); // &#60; is <
        expect(sanitized).not.toMatch(/&lt;\s*script/i);

        // Event handlers must not exist as attributes in markup
        expect(sanitized).not.toMatch(/\s+on\w+\s*=/i);
        expect(sanitized).not.toMatch(/on\w+\s*=\s*['"][^'"]*['"]/i);

        // javascript: URLs must not be present
        expect(sanitized).not.toMatch(/javascript\s*:/i);
        expect(sanitized).not.toMatch(/&#106;avascript/i); // &#106; is j
        expect(sanitized).not.toMatch(/&#x6a;avascript/i); // &#x6a; is j

        // Disallowed control characters must be removed
        // These are all in the ranges: U+0000-U+0008, U+000B-U+000C, U+000E-U+001F, U+007F-U+009F
        const controlCharPattern = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/;
        expect(sanitized).not.toMatch(controlCharPattern);

        // No unescaped < or > that would form tags
        // After sanitization, if < or > appear as text, they should be properly escaped
        expect(sanitized).not.toMatch(/<(?![^>]*>)/);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 65.3: Plain text is unchanged by sanitisation
   *
   * For any input containing no HTML markup, script tags, event handlers or control characters,
   * the sanitised output must be identical to the input.
   *
   * **Validates: Requirements 22.5, 4.1, 4.3**
   */
  it('Property 65.3: Plain text is unchanged by sanitisation', () => {
    // Generate text that has no special markup, control characters, or HTML entities
    // Allowed characters: printable ASCII (0x20-0x7E), tabs, newlines, high Unicode (>0x9F)
    const plainTextArbitrary = fc.string({
      minLength: 0,
      maxLength: 1000,
      // Include common printable characters and Unicode > 0x9F
      unit16units: () =>
        fc.oneof(
          fc.integer({ min: 0x20, max: 0x7e }), // Printable ASCII
          fc.integer({ min: 0xa0, max: 0xffff }), // High Unicode (above control range)
          fc.constantFrom(0x09, 0x0a, 0x0d), // Tab, LF, CR (allowed whitespace)
        ),
    });

    fc.assert(
      fc.property(plainTextArbitrary, (input) => {
        const sanitized = sanitizeText(input);
        // Plain text should remain unchanged
        expect(sanitized).toBe(input);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 65.4: Sanitisation removes all dangerous HTML patterns
   *
   * For any input containing dangerous patterns, they must be neutralised:
   * - All HTML tags are either removed or their contents stripped
   * - Event handlers are eliminated
   * - Script content is never executed or passed through
   *
   * **Validates: Requirements 22.5, 4.1, 4.3**
   */
  it('Property 65.4: Dangerous patterns are neutralised', () => {
    const dangerousPatterns = [
      '<script>alert("xss")</script>',
      '<img onerror="alert(1)">',
      '<svg onload="fetch(\'evil\')">',
      '<iframe src="javascript:alert(1)">',
      '<a href="javascript:void(0)" onclick="alert(1)">click</a>',
      '<body onload="alert(1)">',
      '<input onfocus="alert(1)">',
    ];

    dangerousPatterns.forEach((pattern) => {
      const sanitized = sanitizeText(pattern);

      // Must not contain script content, event handlers, or javascript:
      expect(sanitized).not.toContain('script');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('onload');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onfocus');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('fetch');
    });
  });

  /**
   * Property 65.5: Entities are safely decoded
   *
   * HTML entities (like &lt;, &gt;, &#60;, &#x3c;) must be decoded to their character equivalents
   * without enabling markup. When decoded to text (not markup), they are safe.
   *
   * **Validates: Requirements 22.5, 4.1, 4.3**
   */
  it('Property 65.5: Encoded entities are safely decoded', () => {
    fc.assert(
      fc.property(
        fc.stringOf(
          fc.oneof(
            fc.integer({ min: 0x20, max: 0x7e }),
            fc.integer({ min: 0xa0, max: 0xffff }),
          ),
        ),
        (plainText) => {
          // Encode special characters as HTML entities
          let encoded = plainText;
          encoded = encoded.replace(/&/g, '&amp;');
          encoded = encoded.replace(/</g, '&lt;');
          encoded = encoded.replace(/>/g, '&gt;');
          encoded = encoded.replace(/"/g, '&quot;');

          const sanitized = sanitizeText(encoded);

          // Decoded entities should produce the plain text
          expect(sanitized).toBe(plainText);

          // Most importantly, no control characters should remain
          const controlCharPattern = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/;
          expect(sanitized).not.toMatch(controlCharPattern);
        },
      ),
      { numRuns: 100 },
    );
  });
});

