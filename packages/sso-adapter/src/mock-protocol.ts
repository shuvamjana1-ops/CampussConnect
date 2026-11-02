/**
 * Wire protocol shared by `MockSsoProvider` and the `apps/mock-sso` server.
 *
 * The mock is OIDC-shaped: authorization code flow, one issuer per Tenant at `{base}/t/{slug}`,
 * a discovery document, and HS256 ID tokens signed with the client secret (OIDC Core 10.1).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** The only ID token algorithm the mock issues and accepts. */
export const MOCK_ID_TOKEN_ALG = 'HS256';

/** Callback query parameter carrying the account name the user typed when sign-in fails. */
export const MOCK_ACCOUNT_HINT_PARAM = 'login_hint';

/** `error_description` the mock sends with `access_denied` when credentials are wrong. */
export const MOCK_INVALID_CREDENTIALS = 'invalid_credentials';

/** OAuth 2.0 error codes used by the mock (RFC 6749 4.1.2.1 and 5.2). */
export const OAUTH_ERRORS = {
  accessDenied: 'access_denied',
  invalidClient: 'invalid_client',
  invalidGrant: 'invalid_grant',
  invalidRequest: 'invalid_request',
  invalidScope: 'invalid_scope',
  serverError: 'server_error',
  temporarilyUnavailable: 'temporarily_unavailable',
  unsupportedGrantType: 'unsupported_grant_type',
  unsupportedResponseType: 'unsupported_response_type',
} as const;

/** A DNS label: the form of a Tenant slug. */
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidTenantSlug(slug: string): boolean {
  return TENANT_SLUG_PATTERN.test(slug);
}

/** Issuer identifier of a Tenant on the mock server. */
export function mockIssuer(issuerBaseUrl: string, tenantSlug: string): string {
  if (!isValidTenantSlug(tenantSlug)) {
    throw new TypeError('Invalid tenant slug');
  }
  return `${issuerBaseUrl.replace(/\/+$/, '')}/t/${tenantSlug}`;
}

export interface MockEndpoints {
  readonly authorization: string;
  readonly token: string;
  readonly discovery: string;
}

export function mockEndpoints(issuer: string): MockEndpoints {
  return {
    authorization: `${issuer}/authorize`,
    token: `${issuer}/token`,
    discovery: `${issuer}/.well-known/openid-configuration`,
  };
}

/** Claims in a mock ID token. */
export interface MockIdTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly auth_time: number;
  readonly nonce: string;
  readonly amr: readonly string[];
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function parseBase64UrlJson(segment: string): unknown {
  if (!BASE64URL_PATTERN.test(segment)) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return value;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hmacSha256(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data, 'utf8').digest();
}

/** Signs an ID token with HS256 using the client secret as the key. */
export function signIdToken(claims: MockIdTokenClaims, clientSecret: string): string {
  const header = base64UrlJson({ alg: MOCK_ID_TOKEN_ALG, typ: 'JWT' });
  const payload = base64UrlJson(claims);
  const signature = hmacSha256(clientSecret, `${header}.${payload}`).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Verifies the HS256 signature of an ID token and returns its payload, or `undefined` if the token is malformed,
 * uses another algorithm (including `none`) or has a bad signature. Claims are not checked here.
 */
export function verifyIdTokenSignature(token: string, clientSecret: string): Record<string, unknown> | undefined {
  const parts = token.split('.');
  const [header, payload, signature] = parts;
  if (parts.length !== 3 || header === undefined || payload === undefined || signature === undefined) {
    return undefined;
  }
  const headerJson = parseBase64UrlJson(header);
  if (!isRecord(headerJson) || headerJson.alg !== MOCK_ID_TOKEN_ALG) {
    return undefined;
  }
  if (!BASE64URL_PATTERN.test(signature)) {
    return undefined;
  }
  const expected = hmacSha256(clientSecret, `${header}.${payload}`);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return undefined;
  }
  const payloadJson = parseBase64UrlJson(payload);
  return isRecord(payloadJson) ? payloadJson : undefined;
}

/** Compares two secrets in time independent of where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}
