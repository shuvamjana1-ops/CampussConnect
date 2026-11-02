/** Injection token for the allowlisted structured logger. */
export const LOGGER = Symbol('LOGGER');

/** Injection tokens for the ports the request guards depend on. */
export const SESSION_READER = Symbol('SESSION_READER');
export const HOST_TENANT_RESOLVER = Symbol('HOST_TENANT_RESOLVER');
export const PRINCIPAL_DIRECTORY = Symbol('PRINCIPAL_DIRECTORY');
export const GUARD_AUDITOR = Symbol('GUARD_AUDITOR');
export const RATE_LIMIT_CONFIG = Symbol('RATE_LIMIT_CONFIG');
export const SLIDING_WINDOW = Symbol('SLIDING_WINDOW');
export const TENANT_OWNERSHIP = Symbol('TENANT_OWNERSHIP');

/** Injection tokens for audit administration (18.2). */
export const AUDIT_DATABASE = Symbol('AUDIT_DATABASE');
export const AUDIT_ANCHOR_STORE = Symbol('AUDIT_ANCHOR_STORE');
