import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashPassword, parsePasswordHash, verifyPassword, type ScryptParams } from './passwords';
import { SeedError, UserDirectory, loadSeedFile, parseSeed } from './seed';

const FAST_SCRYPT: ScryptParams = { N: 1024, r: 8, p: 1 };
let hash: string;

beforeAll(async () => {
  hash = await hashPassword('correct horse battery', FAST_SCRYPT);
});

describe('passwords', () => {
  it('verifies the hashed password and rejects others', async () => {
    const parsed = parsePasswordHash(hash);

    expect(parsed).toBeDefined();
    if (parsed === undefined) {
      return;
    }
    await expect(verifyPassword('correct horse battery', parsed)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterz', parsed)).resolves.toBe(false);
    await expect(verifyPassword('', parsed)).resolves.toBe(false);
  });

  it('rejects malformed hashes and unsafe cost parameters', () => {
    const [, , , , salt, key] = hash.split('$');
    expect(parsePasswordHash('plain-text-password')).toBeUndefined();
    expect(parsePasswordHash(`scrypt$1000$8$1$${salt ?? ''}$${key ?? ''}`)).toBeUndefined();
    expect(parsePasswordHash(`bcrypt$1024$8$1$${salt ?? ''}$${key ?? ''}`)).toBeUndefined();
  });
});

describe('parseSeed', () => {
  it('accepts users seeded per tenant', () => {
    const seed = parseSeed({
      tenants: [
        { slug: 'iitx', users: [{ subject: 'STU-1', passwordHash: hash, authMethods: ['pwd', 'otp'] }] },
        { slug: 'nity', users: [{ subject: 'STU-1', passwordHash: hash }] },
      ],
    });
    const directory = new UserDirectory(seed);

    expect(directory.findUser('iitx', 'STU-1')?.authMethods).toEqual(['pwd', 'otp']);
    expect(directory.findUser('nity', 'STU-1')?.authMethods).toEqual(['pwd']);
    expect(directory.findUser('iitx', 'STU-2')).toBeUndefined();
    expect(directory.hasTenant('other')).toBe(false);
  });

  it.each([
    ['an unknown field', { tenants: [{ slug: 'iitx', users: [], region: 'ap-south-1' }] }, 'unknown field'],
    ['an invalid slug', { tenants: [{ slug: 'IIT X', users: [] }] }, 'slug'],
    ['a duplicate tenant', { tenants: [{ slug: 'iitx', users: [] }, { slug: 'iitx', users: [] }] }, 'duplicate'],
    ['a plain-text password', { tenants: [{ slug: 'iitx', users: [{ subject: 'S', passwordHash: 'pw' }] }] }, 'passwordHash'],
    ['a subject with spaces', { tenants: [{ slug: 'iitx', users: [{ subject: 'S 1', passwordHash: '' }] }] }, 'subject'],
  ])('rejects %s', (_label, input, message) => {
    expect(() => parseSeed(input)).toThrow(SeedError);
    expect(() => parseSeed(input)).toThrow(message);
  });

  it('rejects a duplicate subject within a tenant', () => {
    const user = { subject: 'STU-1', passwordHash: hash };
    expect(() => parseSeed({ tenants: [{ slug: 'iitx', users: [user, user] }] })).toThrow('duplicate subject');
  });

  it('loads a JSON seed file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mock-sso-seed-'));
    try {
      const file = join(dir, 'seed.json');
      await writeFile(file, JSON.stringify({ tenants: [{ slug: 'iitx', users: [{ subject: 'STU-1', passwordHash: hash }] }] }));
      const seed = await loadSeedFile(file);
      expect(seed.tenants[0]?.users[0]?.subject).toBe('STU-1');

      await writeFile(file, '{ not json');
      await expect(loadSeedFile(file)).rejects.toThrow(SeedError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
