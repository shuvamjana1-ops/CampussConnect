// RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s step) using only node:crypto.
// Compatible with standard authenticator apps. Implements the `TotpEngine` port.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TotpEngine } from './identity.types';

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW_STEPS = 1;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new RangeError('Invalid base32 character.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function codeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export class NodeTotpEngine implements TotpEngine {
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  verify(secret: string, code: string, nowMs: number): number | undefined {
    if (!/^\d{6}$/.test(code)) return undefined;
    const key = base32Decode(secret);
    const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
    const given = Buffer.from(code);
    let matched: number | undefined;
    // Check every step in the window so timing does not reveal which one matched.
    for (let step = current - WINDOW_STEPS; step <= current + WINDOW_STEPS; step++) {
      const expected = Buffer.from(codeForStep(key, step));
      if (timingSafeEqual(expected, given)) matched = step;
    }
    return matched;
  }

  keyUri(secret: string, accountName: string, issuer: string): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
    return (
      `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
    );
  }
}
