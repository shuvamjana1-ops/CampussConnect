import { describe, expect, it } from 'vitest';

import { ConfigError, configFromEnv, isRegisteredRedirectUri } from './config';

const SEED = { tenants: [] };
const ENV = {
  MOCK_SSO_ISSUER_BASE_URL: 'https://sso.campusconnect.test',
  MOCK_SSO_CLIENT_ID: 'campusconnect',
  MOCK_SSO_CLIENT_SECRET: 'a-client-secret-of-at-least-32-chars',
  MOCK_SSO_REDIRECT_URIS: 'https://{slug}.campusconnect.test/api/v1/auth/callback, http://localhost:3000/api/v1/auth/callback',
};

describe('configFromEnv', () => {
  it('builds one client with the redirect URI templates', () => {
    const config = configFromEnv(ENV, SEED);

    expect(config.clients).toEqual([
      {
        clientId: 'campusconnect',
        clientSecret: ENV.MOCK_SSO_CLIENT_SECRET,
        redirectUris: ['https://{slug}.campusconnect.test/api/v1/auth/callback', 'http://localhost:3000/api/v1/auth/callback'],
      },
    ]);
    expect(config.adminToken).toBeUndefined();
  });

  it('names missing variables without echoing values', () => {
    const withoutSecret = { ...ENV, MOCK_SSO_CLIENT_SECRET: undefined };

    expect(() => configFromEnv(withoutSecret, SEED)).toThrow(ConfigError);
    expect(() => configFromEnv(withoutSecret, SEED)).toThrow('MOCK_SSO_CLIENT_SECRET');
  });

  it.each([
    ['a short client secret', { MOCK_SSO_CLIENT_SECRET: 'short' }],
    ['a short admin token', { MOCK_SSO_ADMIN_TOKEN: 'short' }],
    ['plain http to a public host', { MOCK_SSO_REDIRECT_URIS: 'http://{slug}.campusconnect.test/callback' }],
    ['an issuer with a query', { MOCK_SSO_ISSUER_BASE_URL: 'https://sso.campusconnect.test/?x=1' }],
  ])('rejects %s', (_label, override) => {
    expect(() => configFromEnv({ ...ENV, ...override }, SEED)).toThrow(ConfigError);
  });
});

describe('isRegisteredRedirectUri', () => {
  const client = {
    clientId: 'campusconnect',
    clientSecret: ENV.MOCK_SSO_CLIENT_SECRET,
    redirectUris: ['https://{slug}.campusconnect.test/api/v1/auth/callback'],
  };

  it('matches the template for the same tenant only, exactly', () => {
    expect(isRegisteredRedirectUri(client, 'iitx', 'https://iitx.campusconnect.test/api/v1/auth/callback')).toBe(true);
    expect(isRegisteredRedirectUri(client, 'iitx', 'https://nity.campusconnect.test/api/v1/auth/callback')).toBe(false);
    expect(isRegisteredRedirectUri(client, 'iitx', 'https://iitx.campusconnect.test/api/v1/auth/callback?x=1')).toBe(
      false,
    );
  });
});
