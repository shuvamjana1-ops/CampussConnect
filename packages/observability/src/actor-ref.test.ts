import { createHmac, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createActorRefHasher, hkdfActorRefKeys, isActorRef } from './actor-ref';

const MASTER_SECRET = new Uint8Array(32).fill(7);
const TENANT_A = '0190a1b2-0000-7000-8000-00000000000a';
const TENANT_B = '0190a1b2-0000-7000-8000-00000000000b';
const USER_1 = '0190a1b2-0000-7000-8000-000000000001';
const USER_2 = '0190a1b2-0000-7000-8000-000000000002';

const actorRef = createActorRefHasher(hkdfActorRefKeys(MASTER_SECRET));

describe('actorRef', () => {
  it('is HMAC-SHA256 of the user id under the HKDF-derived Tenant key, truncated to 128 bits', () => {
    const key = new Uint8Array(hkdfSync('sha256', MASTER_SECRET, 'campusconnect/actor-ref/v1', TENANT_A, 32));
    const expected = createHmac('sha256', key).update(USER_1).digest('hex').slice(0, 32);

    expect(actorRef(TENANT_A, USER_1)).toBe(expected);
  });

  it('is stable for one user in one Tenant and ignores UUID letter case', () => {
    expect(actorRef(TENANT_A, USER_1)).toBe(actorRef(TENANT_A.toUpperCase(), USER_1.toUpperCase()));
  });

  it('differs between users and between Tenants, so refs cannot be linked across Tenants', () => {
    const refs = new Set([actorRef(TENANT_A, USER_1), actorRef(TENANT_A, USER_2), actorRef(TENANT_B, USER_1)]);
    expect(refs.size).toBe(3);
  });

  it('is 32 lower-case hex characters and does not contain the user id', () => {
    const ref = actorRef(TENANT_A, USER_1);
    expect(isActorRef(ref)).toBe(true);
    expect(ref).not.toContain(USER_1.replaceAll('-', '').slice(0, 8));
  });

  it('rejects ids that are not UUIDs', () => {
    expect(() => actorRef('tenant-a', USER_1)).toThrow(RangeError);
    expect(() => actorRef(TENANT_A, 'priya@example.edu')).toThrow(RangeError);
  });

  it('rejects master secrets and resolved keys shorter than 32 bytes', () => {
    expect(() => hkdfActorRefKeys(new Uint8Array(31))).toThrow(RangeError);
    const shortKey = createActorRefHasher(() => new Uint8Array(16));
    expect(() => shortKey(TENANT_A, USER_1)).toThrow(RangeError);
  });

  it('passes the lower-cased Tenant id to the key resolver', () => {
    const seen: string[] = [];
    const hasher = createActorRefHasher((tenantId) => {
      seen.push(tenantId);
      return MASTER_SECRET;
    });
    hasher(TENANT_A.toUpperCase(), USER_1);
    expect(seen).toEqual([TENANT_A]);
  });
});
