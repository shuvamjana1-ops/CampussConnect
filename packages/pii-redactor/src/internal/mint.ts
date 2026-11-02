import { createHash } from 'node:crypto';

declare const redacted: unique symbol;

/**
 * Text that has passed the PII_Redactor (5.14). Only this package can mint it: the brand symbol is not
 * exported, and dependency-cruiser forbids imports of `src/internal/` from outside this package (design rule 4).
 */
export type RedactedText = string & { readonly [redacted]: true };

/**
 * Per-process mint registry used by the AI egress guard.
 *
 * JavaScript strings cannot be held by `WeakRef`, so the registry keeps the SHA-256 digests (over UTF-16
 * code units) of the texts this process minted, in least-recently-used order with a fixed capacity. A text
 * evicted from the registry is not trusted; the egress guard then re-scans it by calling `redact()` again
 * and accepting the result only if it is unchanged.
 */
const REGISTRY_CAPACITY = 50_000;
const registry = new Map<string, true>();

function digest(text: string): string {
  return createHash('sha256').update(text, 'utf16le').digest('base64');
}

function remember(key: string): void {
  registry.delete(key);
  registry.set(key, true);
  if (registry.size > REGISTRY_CAPACITY) {
    for (const oldest of registry.keys()) {
      registry.delete(oldest);
      break;
    }
  }
}

/** Brands `text` as redacted and records it in the mint registry. Call only with redactor output. */
export function mintRedactedText(text: string): RedactedText {
  remember(digest(text));
  return text as RedactedText;
}

/**
 * True when this process's PII_Redactor produced `value`. The AI egress guard calls this before sending
 * any text to an AI provider and refuses text it cannot verify (5.14).
 */
export function isRedactedText(value: unknown): value is RedactedText {
  if (typeof value !== 'string') {
    return false;
  }
  const key = digest(value);
  if (!registry.has(key)) {
    return false;
  }
  remember(key);
  return true;
}
