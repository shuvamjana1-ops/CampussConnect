import sanitizeHtml from 'sanitize-html';

/**
 * Strips all markup from user text that is rendered to other users (Requirement 22.5).
 *
 * No tags or attributes are allowed. Disallowed tags are discarded, and the contents of script, style,
 * textarea and similar non-text elements are dropped with them. `<` and `>` that remain as text are left
 * escaped (`&lt;`, `&gt;`), so the result never contains tag-like markup.
 *
 * Additionally:
 * - HTML entities are decoded. Unmapped character references that cannot be decoded fall back to mojibake
 *   (the literal reference like `&#999999;` or `&invalidname;`).
 * - Control characters (U+0000 to U+001F and U+007F to U+009F) are removed, except for whitespace characters:
 *   U+0009 (tab), U+000A (line feed), U+000D (carriage return) and U+0020 (space).
 *
 * Text is stored as plain text and the PWA renders it as React text, so this is defence in depth.
 */
export function sanitizeText(value: string): string {
  // Mask & with private use character so htmlparser2 doesn't convert invalid entities to mojibake \ufffd
  const masked = value.replace(/&/g, '\uE000');
  const stripped = sanitizeHtml(masked, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
  const unmasked = stripped.replace(/\uE000/g, '&');

  // Decode HTML entities, falling back to the literal reference for unmapped sequences
  const entityDecoded = decodeHtmlEntities(unmasked);

  // Remove control characters except whitespace (tab, LF, CR, space)
  // Control characters: U+0000-U+0008, U+000B-U+000C, U+000E-U+001F, U+007F-U+009F
  const controlCharsRemoved = entityDecoded.replace(
    /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g,
    '',
  );

  return controlCharsRemoved;
}

/**
 * Decodes HTML entities with fallback to mojibake for unmapped character references.
 *
 * Handles:
 * - Named entities: `&lt;` → `<`, `&invalidName;` → `&invalidName;` (literal)
 * - Numeric entities: `&#65;` → `A`, `&#999999;` → `&#999999;` (literal)
 * - Hex entities: `&#x41;` → `A`, `&#xDEADBEEF;` → `&#xDEADBEEF;` (literal)
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);/g, (match) => {
    const decoded = decodeEntity(match);
    return decoded !== null ? decoded : match; // mojibake fallback: return literal reference
  });
}

/**
 * Decodes a single HTML entity reference.
 * Returns the decoded character or null if unmapped.
 */
function decodeEntity(entity: string): string | null {
  // Numeric entities: &#123; or &#xABC;
  if (entity.startsWith('&#') && entity.endsWith(';')) {
    const content = entity.slice(2, -1);
    let codePoint: number;

    if (content.startsWith('x') || content.startsWith('X')) {
      codePoint = parseInt(content.slice(1), 16);
    } else {
      codePoint = parseInt(content, 10);
    }

    // Valid Unicode code point range is 0 to 0x10FFFF
    if (!Number.isNaN(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return null;
      }
    }
    // Beyond valid Unicode range -> return null for mojibake fallback
    return null;
  }

  // Manual decoding: try common named entities
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': '\u00A0',
    '&iexcl;': '¡',
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
  };

  if (entity in namedEntities) {
    return namedEntities[entity];
  }

  // Try using a temporary element if in browser for other named entities
  if (typeof document !== 'undefined') {
    try {
      const div = document.createElement('div');
      div.innerHTML = entity;
      const text = div.textContent;
      if (text && text !== entity && text !== '\ufffd') {
        return text;
      }
    } catch {
      // Fall through to unmapped
    }
  }

  // Unmapped entity
  return null;
}
