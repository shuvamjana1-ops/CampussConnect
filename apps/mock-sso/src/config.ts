import { isValidTenantSlug } from '@campusconnect/sso-adapter/mock-protocol';

import type { FailureModeSetting } from './failure-modes';
import type { MockSsoSeed } from './seed';

/** The client secret is also the HS256 ID token key, so it must carry at least 256 bits. */
export const MIN_SECRET_LENGTH = 32;

/** A relying party registered with the mock. */
export interface ClientRegistration {
  readonly clientId: string;
  readonly clientSecret: string;
  /**
   * Allowed redirect URIs. `{slug}` is replaced with the Tenant slug and the result must match the
   * `redirect_uri` exactly, for example `https://{slug}.campusconnect.app/api/v1/auth/callback`.
   */
  readonly redirectUris: readonly string[];
}

export interface MockSsoServerConfig {
  /** Public base URL. Defaults to the address the server listens on, which suits tests and local runs. */
  readonly issuerBaseUrl?: string | undefined;
  readonly clients: readonly ClientRegistration[];
  readonly seed: MockSsoSeed;
  /** Bearer token for `/__admin` endpoints. When unset the admin endpoints do not exist. */
  readonly adminToken?: string | undefined;
  readonly initialFailureMode?: FailureModeSetting | undefined;
  /** Lifetime of an authorization code. Default 60 s. */
  readonly codeTtlSeconds?: number | undefined;
  /** Lifetime of an ID token. Default 300 s. */
  readonly idTokenTtlSeconds?: number | undefined;
  /** Clock in epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: (() => number) | undefined;
}

/** Configuration is invalid. The message names variables or fields and never echoes their values. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https everywhere, http only for loopback hosts used in local development. */
function isAllowedUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  if (url.hash !== '' || url.username !== '' || url.password !== '') {
    return false;
  }
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}

/** Validates a redirect URI template by substituting a sample slug. */
export function isValidRedirectUriTemplate(template: string): boolean {
  return isAllowedUrl(template.replaceAll('{slug}', 'tenant'));
}

/** Validates the parts of the configuration that do not come from the seed file. */
export function validateConfig(config: MockSsoServerConfig): void {
  const { issuerBaseUrl } = config;
  if (issuerBaseUrl !== undefined && (!isAllowedUrl(issuerBaseUrl) || new URL(issuerBaseUrl).search !== '')) {
    throw new ConfigError('issuerBaseUrl must be an https URL (http only for loopback) without query or fragment');
  }
  if (config.clients.length === 0) {
    throw new ConfigError('At least one client must be registered');
  }
  const clientIds = new Set<string>();
  config.clients.forEach((client, index) => {
    const path = `clients[${String(index)}]`;
    if (client.clientId === '' || clientIds.has(client.clientId)) {
      throw new ConfigError(`${path}.clientId must be non-empty and unique`);
    }
    clientIds.add(client.clientId);
    if (client.clientSecret.length < MIN_SECRET_LENGTH) {
      throw new ConfigError(`${path}.clientSecret must be at least ${String(MIN_SECRET_LENGTH)} characters`);
    }
    if (client.redirectUris.length === 0 || !client.redirectUris.every(isValidRedirectUriTemplate)) {
      throw new ConfigError(`${path}.redirectUris must be https URLs (http only for loopback) without fragments`);
    }
  });
  if (config.adminToken !== undefined && config.adminToken.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`adminToken must be at least ${String(MIN_SECRET_LENGTH)} characters`);
  }
  for (const [name, value] of [
    ['codeTtlSeconds', config.codeTtlSeconds],
    ['idTokenTtlSeconds', config.idTokenTtlSeconds],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0 || value > 3600)) {
      throw new ConfigError(`${name} must be a whole number of seconds from 1 to 3600`);
    }
  }
}

/** Whether `redirectUri` is registered for `clientId` in the Tenant `slug`. */
export function isRegisteredRedirectUri(client: ClientRegistration, slug: string, redirectUri: string): boolean {
  return isValidTenantSlug(slug) && client.redirectUris.some((template) => template.replaceAll('{slug}', slug) === redirectUri);
}

function required(env: NodeJS.ProcessEnv, name: string, missing: string[]): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') {
    missing.push(name);
    return '';
  }
  return value;
}

/**
 * Reads the configuration from environment variables. Secrets come from the environment, which the
 * deployment fills from Secrets Manager; they are never in code.
 *
 * - `MOCK_SSO_ISSUER_BASE_URL` (required): public base URL.
 * - `MOCK_SSO_CLIENT_ID`, `MOCK_SSO_CLIENT_SECRET` (required): the CampusConnect client.
 * - `MOCK_SSO_REDIRECT_URIS` (required): comma-separated redirect URI templates with `{slug}`.
 * - `MOCK_SSO_ADMIN_TOKEN` (optional): enables the failure-mode admin endpoints.
 */
export function configFromEnv(env: NodeJS.ProcessEnv, seed: MockSsoSeed): MockSsoServerConfig {
  const missing: string[] = [];
  const issuerBaseUrl = required(env, 'MOCK_SSO_ISSUER_BASE_URL', missing);
  const clientId = required(env, 'MOCK_SSO_CLIENT_ID', missing);
  const clientSecret = required(env, 'MOCK_SSO_CLIENT_SECRET', missing);
  const redirectUris = required(env, 'MOCK_SSO_REDIRECT_URIS', missing)
    .split(',')
    .map((uri) => uri.trim())
    .filter((uri) => uri !== '');
  if (missing.length > 0) {
    throw new ConfigError(`Missing environment variables: ${missing.join(', ')}`);
  }
  const adminToken = env.MOCK_SSO_ADMIN_TOKEN?.trim();
  const config: MockSsoServerConfig = {
    issuerBaseUrl,
    clients: [{ clientId, clientSecret, redirectUris }],
    seed,
    adminToken: adminToken === '' ? undefined : adminToken,
  };
  validateConfig(config);
  return config;
}
