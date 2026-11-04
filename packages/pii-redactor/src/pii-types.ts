/**
 * PII types, placeholders and spans shared by the public API and the redaction staff.
 *
 * This module has no imports: the redaction staff loads it directly through Node.js type stripping.
 */

/**
 * PII types the PII_Redactor detects, in the fixed priority order used when merged spans have the same
 * length (design.md, PII_Redactor). The first entry has the highest priority.
 */
export const PII_TYPES = [
  "EMAIL",
  "PHONE",
  "GOV_ID",
  "BANK_CARD",
  "ROLL_NO",
  "ADDRESS",
  "NAME",
] as const;

export type PiiType = (typeof PII_TYPES)[number];

/** Placeholder written in place of a redacted item (5.2). */
export type PiiPlaceholder = `[PII:${PiiType}]`;

/** A redacted span. Offsets are UTF-16 code unit offsets into the original text; `end` is exclusive. */
export interface RedactionSpan {
  readonly type: PiiType;
  readonly start: number;
  readonly end: number;
}

export function placeholderFor(type: PiiType): PiiPlaceholder {
  return `[PII:${type}]`;
}

/** Merge priority of a type. Lower numbers win. */
export function typePriority(type: PiiType): number {
  return PII_TYPES.indexOf(type);
}

/** RE2 source that matches any placeholder the redactor writes. */
export const PLACEHOLDER_SOURCE = String.raw`\[PII:(?:${PII_TYPES.join("|")})\]`;
