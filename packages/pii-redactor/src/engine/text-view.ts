import RE2 from 're2';
import { PLACEHOLDER_SOURCE } from '../pii-types.ts';
import { findAll } from './scan.ts';

/** Replaces placeholder characters in the view so that no detector matches inside a placeholder. */
const MASK = 0xfffd;
const PLACEHOLDER = new RE2(PLACEHOLDER_SOURCE, 'g');

/**
 * Maps one UTF-16 code unit of the input to the code unit detectors see:
 * fullwidth ASCII variants to ASCII, Indic-script digits to ASCII digits, Unicode spaces to a space,
 * Unicode dashes to a hyphen and small or fullwidth "@" to "@". Every mapping is one unit to one unit.
 */
function mapCodeUnit(code: number): number {
  if (code < 0x80) {
    return code;
  }
  if (code >= 0xff01 && code <= 0xff5e) {
    return code - 0xfee0;
  }
  // Digits of the Indic blocks U+0900–U+0D7F sit at offsets 0x66–0x6F of each 128-character block.
  if (code >= 0x0966 && code <= 0x0d6f) {
    const digit = (code & 0x7f) - 0x66;
    if (digit >= 0 && digit <= 9) {
      return 0x30 + digit;
    }
  }
  if ((code >= 0x2000 && code <= 0x200b) || code === 0x00a0 || code === 0x1680 || code === 0x2028 ||
    code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x2060 || code === 0x3000 || code === 0xfeff) {
    return 0x20;
  }
  if ((code >= 0x2010 && code <= 0x2015) || code === 0x2212 || code === 0xfe58 || code === 0xfe63) {
    return 0x2d;
  }
  if (code === 0xfe6b) {
    return 0x40;
  }
  return code;
}

/**
 * Builds the text the detectors scan. It has the same length as the input, so detector offsets are
 * offsets into the original text, and existing `[PII:TYPE]` placeholders are masked so redaction is
 * idempotent.
 */
export function buildDetectionView(input: string): string {
  const units = new Uint16Array(input.length);
  let changed = false;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const mapped = mapCodeUnit(code);
    units[i] = mapped;
    changed ||= mapped !== code;
  }
  let view = changed ? fromCodeUnits(units) : input;
  const placeholders = findAll(PLACEHOLDER, view);
  if (placeholders.length > 0) {
    for (const { start, end } of placeholders) {
      units.fill(MASK, start, end);
    }
    view = fromCodeUnits(units);
  }
  return view;
}

function fromCodeUnits(units: Uint16Array): string {
  const chunk = 8192;
  let text = '';
  for (let i = 0; i < units.length; i += chunk) {
    text += String.fromCharCode(...units.subarray(i, i + chunk));
  }
  return text;
}
