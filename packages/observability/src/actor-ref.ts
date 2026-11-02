import { createHmac, hkdfSync } from 'node:crypto';

import { isUuid, normalizeTenantId } from './validation';

declare const actorRefBrand: unique symbol;

/**
 * A pseudonymous reference to a user: an HMAC of the user id under a per-tenant key (25.1).
 * Engineers can correlate one user's requests within a Tenant without seeing the user id. The same user gets
 * a different actorRef in every Tenant, and nobody can recover the user id from logs without the key.
 */
export type ActorRef = string & { readonly [actorRefBrand]: true };

/** Returns the HMAC key for a Tenant. Receives the lower-cased Tenant id. Keys must be at least 32 bytes. */
export type ActorRefKeyResolver = (tenantId: string) => Uint8Array;

/** Computes the actorRef for a user in a Tenant. Both ids must be UUIDs. */
export type ActorRefHasher = (tenantId: string, userId: string) => ActorRef;

/** HMAC-SHA256 keys shorter than the hash output weaken the MAC. */
export const MIN_ACTOR_REF_KEY_BYTES = 32;

/** The HMAC output is truncated to 128 bits (32 hex characters), which RFC 2104 allows and keeps log lines short. */
const ACTOR_REF_HEX_LENGTH = 32;
const ACTOR_REF = /^[0-9a-f]{32}$/;

/** HKDF salt. Changing it changes every actorRef, so a new version gets a new salt. */
const HKDF_SALT = 'campusconnect/actor-ref/v1';

export function isActorRef(value: unknown): value is ActorRef {
  return typeof value === 'string' && ACTOR_REF.test(value);
}

/**
 * Derives each Tenant's actorRef key from one platform master secret with HKDF-SHA256, using the Tenant id as
 * the HKDF info. The master secret lives in Secrets Manager (22.6); no per-tenant key needs storing.
 * Derived keys are cached for the life of the process.
 */
export function hkdfActorRefKeys(masterSecret: Uint8Array): ActorRefKeyResolver {
  if (masterSecret.byteLength < MIN_ACTOR_REF_KEY_BYTES) {
    throw new RangeError(`The actorRef master secret must be at least ${String(MIN_ACTOR_REF_KEY_BYTES)} bytes.`);
  }
  const secret = Uint8Array.from(masterSecret);
  const keys = new Map<string, Uint8Array>();
  return (tenantId) => {
    let key = keys.get(tenantId);
    if (key === undefined) {
      key = new Uint8Array(hkdfSync('sha256', secret, HKDF_SALT, tenantId, MIN_ACTOR_REF_KEY_BYTES));
      keys.set(tenantId, key);
    }
    return key;
  };
}

/**
 * Creates the function that turns a user id into an {@link ActorRef}. Ids are lower-cased first, so the same
 * UUID always gives the same actorRef. Throws `RangeError` for ids that are not UUIDs or keys that are too short.
 */
export function createActorRefHasher(resolveKey: ActorRefKeyResolver): ActorRefHasher {
  return (tenantId, userId) => {
    if (!isUuid(tenantId)) {
      throw new RangeError('tenantId must be a UUID.');
    }
    if (!isUuid(userId)) {
      throw new RangeError('userId must be a UUID.');
    }
    const key = resolveKey(normalizeTenantId(tenantId));
    if (key.byteLength < MIN_ACTOR_REF_KEY_BYTES) {
      throw new RangeError(`An actorRef key must be at least ${String(MIN_ACTOR_REF_KEY_BYTES)} bytes.`);
    }
    const digest = createHmac('sha256', key).update(userId.toLowerCase(), 'utf8').digest('hex');
    return digest.slice(0, ACTOR_REF_HEX_LENGTH) as ActorRef;
  };
}
