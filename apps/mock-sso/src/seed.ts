import { readFile } from 'node:fs/promises';

import { isValidTenantSlug } from '@campusconnect/sso-adapter/mock-protocol';

import { parsePasswordHash, type ParsedPasswordHash } from './passwords';

/**
 * A user in the seed file. Users sign in with their `subject`, which is also the OIDC `sub` and matches the
 * ERP stub `externalId`, so the seeded users line up with the ERP stub records of the same Tenant.
 */
export interface SeedUser {
  readonly subject: string;
  /** `scrypt$N$r$p$salt$key`, produced by `hashPassword`. */
  readonly passwordHash: string;
  /** OIDC `amr` values for this user. Defaults to `['pwd']`. */
  readonly authMethods?: readonly string[];
}

export interface SeedTenant {
  readonly slug: string;
  readonly users: readonly SeedUser[];
}

/** Users seeded per Tenant. */
export interface MockSsoSeed {
  readonly tenants: readonly SeedTenant[];
}

/** The seed file is invalid. The message names the field path and never echoes values. */
export class SeedError extends Error {
  override readonly name = 'SeedError';
}

const SUBJECT_PATTERN = /^[\x21-\x7E]{1,255}$/;
const AMR_PATTERN = /^[a-z]{2,16}$/;
const DEFAULT_AUTH_METHODS: readonly string[] = ['pwd'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new SeedError(`${path}: unknown field "${key}"`);
    }
  }
}

function parseUser(input: unknown, path: string): SeedUser {
  if (!isRecord(input)) {
    throw new SeedError(`${path}: must be an object`);
  }
  checkKeys(input, ['subject', 'passwordHash', 'authMethods'], path);
  const { subject, passwordHash, authMethods } = input;
  if (typeof subject !== 'string' || !SUBJECT_PATTERN.test(subject)) {
    throw new SeedError(`${path}.subject: must be 1 to 255 printable ASCII characters without spaces`);
  }
  if (typeof passwordHash !== 'string' || parsePasswordHash(passwordHash) === undefined) {
    throw new SeedError(`${path}.passwordHash: must be a scrypt hash produced by hashPassword`);
  }
  if (authMethods === undefined) {
    return { subject, passwordHash };
  }
  if (
    !Array.isArray(authMethods) ||
    authMethods.length === 0 ||
    authMethods.length > 10 ||
    !authMethods.every((method) => typeof method === 'string' && AMR_PATTERN.test(method))
  ) {
    throw new SeedError(`${path}.authMethods: must be 1 to 10 lowercase amr values`);
  }
  return { subject, passwordHash, authMethods: authMethods.map(String) };
}

function parseTenant(input: unknown, path: string): SeedTenant {
  if (!isRecord(input)) {
    throw new SeedError(`${path}: must be an object`);
  }
  checkKeys(input, ['slug', 'users'], path);
  const { slug, users } = input;
  if (typeof slug !== 'string' || !isValidTenantSlug(slug)) {
    throw new SeedError(`${path}.slug: must be a lowercase DNS label`);
  }
  if (!Array.isArray(users)) {
    throw new SeedError(`${path}.users: must be an array`);
  }
  const parsed = users.map((user, index) => parseUser(user, `${path}.users[${String(index)}]`));
  const subjects = new Set<string>();
  parsed.forEach((user, index) => {
    if (subjects.has(user.subject)) {
      throw new SeedError(`${path}.users[${String(index)}].subject: duplicate subject in tenant`);
    }
    subjects.add(user.subject);
  });
  return { slug, users: parsed };
}

/** Validates seed data. Unknown fields are rejected. */
export function parseSeed(input: unknown): MockSsoSeed {
  if (!isRecord(input)) {
    throw new SeedError('seed: must be an object');
  }
  checkKeys(input, ['tenants'], 'seed');
  const { tenants } = input;
  if (!Array.isArray(tenants)) {
    throw new SeedError('seed.tenants: must be an array');
  }
  const parsed = tenants.map((tenant, index) => parseTenant(tenant, `seed.tenants[${String(index)}]`));
  const slugs = new Set<string>();
  parsed.forEach((tenant, index) => {
    if (slugs.has(tenant.slug)) {
      throw new SeedError(`seed.tenants[${String(index)}].slug: duplicate tenant slug`);
    }
    slugs.add(tenant.slug);
  });
  return { tenants: parsed };
}

/** Reads and validates a JSON seed file. */
export async function loadSeedFile(path: string): Promise<MockSsoSeed> {
  const text = await readFile(path, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SeedError('seed: file is not valid JSON');
  }
  return parseSeed(json);
}

export interface DirectoryUser {
  readonly subject: string;
  readonly passwordHash: ParsedPasswordHash;
  readonly authMethods: readonly string[];
}

/** Seeded users, looked up per Tenant. A user exists only in the Tenant that seeded it. */
export class UserDirectory {
  readonly #tenants = new Map<string, Map<string, DirectoryUser>>();

  constructor(seed: MockSsoSeed) {
    for (const tenant of parseSeed(seed).tenants) {
      const users = new Map<string, DirectoryUser>();
      for (const user of tenant.users) {
        const passwordHash = parsePasswordHash(user.passwordHash);
        if (passwordHash === undefined) {
          throw new SeedError('seed: invalid password hash');
        }
        users.set(user.subject, {
          subject: user.subject,
          passwordHash,
          authMethods: user.authMethods ?? DEFAULT_AUTH_METHODS,
        });
      }
      this.#tenants.set(tenant.slug, users);
    }
  }

  hasTenant(slug: string): boolean {
    return this.#tenants.has(slug);
  }

  findUser(slug: string, subject: string): DirectoryUser | undefined {
    return this.#tenants.get(slug)?.get(subject);
  }

  /** Any seeded hash, so unknown users can be checked at the same cost as known ones. */
  sampleHash(): ParsedPasswordHash | undefined {
    for (const users of this.#tenants.values()) {
      const first = users.values().next();
      if (!first.done) {
        return first.value.passwordHash;
      }
    }
    return undefined;
  }
}
