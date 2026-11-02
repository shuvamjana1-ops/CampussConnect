import RE2 from 're2';
import type { RedactionSpan } from '../../pii-types.ts';
import { findAll } from '../scan.ts';

const WORD = String.raw`\p{L}\p{M}\p{N}`;
const LOCAL = String.raw`[${WORD}._%+\-]+`;
const LABEL = String.raw`[${WORD}](?:[${WORD}\-]*[${WORD}])?`;
const TLD = String.raw`(?i:com|in|org|net|edu|ac|co|gov|nic|res|info|io|me|biz|us|uk|ai|app|dev)`;
/** "@" written as "[at]", "(at)", " at ", " at the rate (of) " and similar. */
const AT = String.raw`(?:\s*[\[({<]\s*(?i:at|@)\s*[\])}>]\s*|\s+(?i:at(?:\s+the\s+rate(?:\s+of)?)?)\s+)`;
/** "." written as "[dot]", "(dot)", " dot " or a plain dot. */
const DOT = String.raw`(?:\s*[\[({<]\s*(?i:dot|\.)\s*[\])}>]\s*|\s+(?i:dot)\s+|\.)`;

/** local@domain, with optional single spaces around "@". */
const PLAIN = new RE2(String.raw`${LOCAL}[ \t]?@[ \t]?${LABEL}(?:\.${LABEL})*`, 'g');
/** "name at domain dot com". Obfuscated forms must end in a common top-level domain. */
const OBFUSCATED = new RE2(String.raw`${LOCAL}${AT}${LABEL}(?:${DOT}${LABEL})*${DOT}${TLD}\b`, 'g');

export function detectEmails(view: string): RedactionSpan[] {
  return [...findAll(PLAIN, view), ...findAll(OBFUSCATED, view)].map((range) => ({ type: 'EMAIL', ...range }));
}
