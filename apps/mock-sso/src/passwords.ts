import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt cost parameters, stored in each hash so they can be raised later without breaking old hashes. */
export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/** One of the OWASP-listed scrypt settings (N = 2^15, r = 8, p = 3). */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };

/** Longest password accepted, so a huge input cannot tie up the key derivation. */
export const MAX_PASSWORD_LENGTH = 1024;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface ParsedPasswordHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function validParams(params: ScryptParams): boolean {
  const { N, r, p } = params;
  const powerOfTwo = Number.isInteger(N) && N >= 2 ** 10 && N <= 2 ** 20 && (N & (N - 1)) === 0;
  return powerOfTwo && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16;
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const options = { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r };
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

/** Parses `scrypt$N$r$p$salt$key` (salt and key base64url). Returns `undefined` if malformed. */
export function parsePasswordHash(encoded: string): ParsedPasswordHash | undefined {
  const parts = encoded.split('$');
  const [prefix, n, r, p, salt, key] = parts;
  if (parts.length !== 6 || prefix !== PREFIX || salt === undefined || key === undefined) {
    return undefined;
  }
  if (!BASE64URL.test(salt) || !BASE64URL.test(key)) {
    return undefined;
  }
  const params: ScryptParams = { N: Number(n), r: Number(r), p: Number(p) };
  if (!validParams(params)) {
    return undefined;
  }
  const saltBytes = Buffer.from(salt, 'base64url');
  const keyBytes = Buffer.from(key, 'base64url');
  if (saltBytes.length < SALT_LENGTH || keyBytes.length !== KEY_LENGTH) {
    return undefined;
  }
  return { params, salt: saltBytes, key: keyBytes };
}

/** Hashes a password for a seed file. */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  if (!validParams(params)) {
    throw new RangeError('Invalid scrypt parameters');
  }
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password must be 1 to ${String(MAX_PASSWORD_LENGTH)} characters`);
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, params);
  return [PREFIX, String(params.N), String(params.r), String(params.p), salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Checks a password against a parsed hash in constant time. */
export async function verifyPassword(password: string, hash: ParsedPasswordHash): Promise<boolean> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  const key = await deriveKey(password, hash.salt, hash.params);
  return timingSafeEqual(key, hash.key);
}
