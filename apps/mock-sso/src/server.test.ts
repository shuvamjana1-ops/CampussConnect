import {
  MockSsoProvider,
  SSO_CALLBACK_TIMEOUT_MS,
  SsoAuthenticationFailedError,
  SsoCallbackError,
  SsoUnavailableError,
  type SsoAuthorizationRequest,
  type TenantRef,
} from '@campusconnect/sso-adapter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_SLOW_DELAY_MS, NORMAL_OPERATION, parseFailureModeSetting } from './failure-modes';
import { hashPassword, type ScryptParams } from './passwords';
import { createMockSsoServer, type MockSsoServer } from './server';

/** Cheap scrypt cost so the suite stays fast. Production seeds use DEFAULT_SCRYPT_PARAMS. */
const FAST_SCRYPT: ScryptParams = { N: 1024, r: 8, p: 1 };
const CLIENT_ID = 'campusconnect';
const CLIENT_SECRET = 'mock-sso-test-client-secret-0123456789';
const ADMIN_TOKEN = 'mock-sso-test-admin-token-0123456789ab';
const REDIRECT_TEMPLATE = 'https://{slug}.campusconnect.test/api/v1/auth/callback';
const IITX: TenantRef = { id: 'tenant-iitx', slug: 'iitx' };
const NITY: TenantRef = { id: 'tenant-nity', slug: 'nity' };
const STUDENT = { subject: 'STU-2024-0001', password: 'student-pass-1' };

function callbackFor(tenant: TenantRef): string {
  return REDIRECT_TEMPLATE.replace('{slug}', tenant.slug);
}

let sso: MockSsoServer;
let baseUrl: string;
let provider: MockSsoProvider;

beforeAll(async () => {
  const studentHash = await hashPassword(STUDENT.password, FAST_SCRYPT);
  const staffHash = await hashPassword('staff-pass-1', FAST_SCRYPT);
  sso = createMockSsoServer({
    clients: [{ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUris: [REDIRECT_TEMPLATE] }],
    seed: {
      tenants: [
        {
          slug: IITX.slug,
          users: [
            { subject: STUDENT.subject, passwordHash: studentHash },
            { subject: 'EMP-0042', passwordHash: staffHash },
          ],
        },
        { slug: NITY.slug, users: [{ subject: 'STU-9000-0001', passwordHash: studentHash }] },
      ],
    },
    adminToken: ADMIN_TOKEN,
  });
  baseUrl = (await sso.listen()).url;
  provider = new MockSsoProvider({ issuerBaseUrl: baseUrl, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
});

afterEach(() => {
  sso.setFailureMode(NORMAL_OPERATION);
});

afterAll(async () => {
  await sso.close();
});

/** Posts the login form as a browser would and returns where the mock redirected to. */
async function submitLogin(
  request: SsoAuthorizationRequest,
  username: string,
  password: string,
): Promise<{ status: number; target: URL; callback: Record<string, string> }> {
  const authorize = new URL(request.redirectUrl);
  const form = new URLSearchParams(authorize.searchParams);
  form.set('username', username);
  form.set('password', password);
  const response = await fetch(`${authorize.origin}${authorize.pathname}`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  });
  const location = response.headers.get('location');
  expect(location).not.toBeNull();
  const target = new URL(location ?? '');
  return { status: response.status, target, callback: Object.fromEntries(target.searchParams) };
}

async function signIn(tenant: TenantRef, username: string, password: string) {
  const request = await provider.buildAuthorizationRequest(tenant, callbackFor(tenant));
  const result = await submitLogin(request, username, password);
  return { request, ...result };
}

describe('OIDC-shaped endpoints', () => {
  it('serves a discovery document for each seeded tenant', async () => {
    const response = await fetch(`${baseUrl}/t/iitx/.well-known/openid-configuration`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      issuer: `${baseUrl}/t/iitx`,
      authorization_endpoint: `${baseUrl}/t/iitx/authorize`,
      token_endpoint: `${baseUrl}/t/iitx/token`,
      response_types_supported: ['code'],
      id_token_signing_alg_values_supported: ['HS256'],
    });
    expect((await fetch(`${baseUrl}/t/unknown/.well-known/openid-configuration`)).status).toBe(404);
  });

  it('renders a login form that carries the authorization request', async () => {
    const request = await provider.buildAuthorizationRequest(IITX, callbackFor(IITX));
    const response = await fetch(request.redirectUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain(`name="state" value="${request.state}"`);
    expect(html).toContain(`name="nonce" value="${request.nonce}"`);
    expect(html).toContain('type="password"');
  });

  it('signs a seeded user in end to end through MockSsoProvider', async () => {
    const { request, status, target, callback } = await signIn(IITX, STUDENT.subject, STUDENT.password);

    expect(status).toBe(303);
    expect(`${target.origin}${target.pathname}`).toBe(callbackFor(IITX));
    expect(callback.state).toBe(request.state);
    await expect(provider.handleCallback(IITX, callback, request)).resolves.toEqual({
      externalSubject: STUDENT.subject,
      authMethods: ['pwd'],
    });
  });

  it('accepts an authorization code only once', async () => {
    const { request, callback } = await signIn(IITX, STUDENT.subject, STUDENT.password);

    await provider.handleCallback(IITX, callback, request);
    const replay = provider.handleCallback(IITX, callback, request);
    await expect(replay).rejects.toBeInstanceOf(SsoCallbackError);
    await expect(replay).rejects.toMatchObject({ failure: 'token_rejected' });
  });

  it('never redirects to a redirect URI that is not registered for the tenant', async () => {
    for (const returnTo of ['https://attacker.test/api/v1/auth/callback', callbackFor(NITY)]) {
      const request = await provider.buildAuthorizationRequest(IITX, returnTo);
      const response = await fetch(request.redirectUrl, { redirect: 'manual' });

      expect(response.status).toBe(400);
      expect(response.headers.get('location')).toBeNull();
    }
  });
});

describe('users seeded per tenant', () => {
  it('rejects a wrong password and reports the account for lockout counting', async () => {
    const { request, callback } = await signIn(IITX, STUDENT.subject, 'not-the-password');

    expect(callback.error).toBe('access_denied');
    expect(callback.code).toBeUndefined();
    const rejection = provider.handleCallback(IITX, callback, request);
    await expect(rejection).rejects.toBeInstanceOf(SsoAuthenticationFailedError);
    await expect(rejection).rejects.toMatchObject({ accountHint: STUDENT.subject });
  });

  it('does not let a user of one tenant sign in to another tenant', async () => {
    const { request, callback } = await signIn(NITY, STUDENT.subject, STUDENT.password);

    expect(callback.error).toBe('access_denied');
    await expect(provider.handleCallback(NITY, callback, request)).rejects.toBeInstanceOf(
      SsoAuthenticationFailedError,
    );
  });
});

describe('failure modes', () => {
  it('wrong_password fails every credential check, including correct ones', async () => {
    sso.setFailureMode({ mode: 'wrong_password', delayMs: 0 });
    const { request, callback } = await signIn(IITX, STUDENT.subject, STUDENT.password);

    expect(callback.error).toBe('access_denied');
    await expect(provider.handleCallback(IITX, callback, request)).rejects.toBeInstanceOf(
      SsoAuthenticationFailedError,
    );
  });

  it('unavailable sends the browser back with temporarily_unavailable', async () => {
    sso.setFailureMode({ mode: 'unavailable', delayMs: 0 });
    const request = await provider.buildAuthorizationRequest(IITX, callbackFor(IITX));
    const response = await fetch(request.redirectUrl, { redirect: 'manual' });
    const callback = Object.fromEntries(new URL(response.headers.get('location') ?? '').searchParams);

    expect(response.status).toBe(302);
    expect(callback.error).toBe('temporarily_unavailable');
    await expect(provider.handleCallback(IITX, callback, request)).rejects.toMatchObject({
      code: 'SSO_UNAVAILABLE',
      reason: 'provider_error',
    });
  });

  it('unavailable makes the token endpoint answer 503', async () => {
    const { request, callback } = await signIn(IITX, STUDENT.subject, STUDENT.password);
    sso.setFailureMode({ mode: 'unavailable', delayMs: 0 });

    const rejection = provider.handleCallback(IITX, callback, request);
    await expect(rejection).rejects.toBeInstanceOf(SsoUnavailableError);
    await expect(rejection).rejects.toMatchObject({ reason: 'provider_error' });
  });

  it('slow delays responses beyond the client deadline by default', () => {
    expect(parseFailureModeSetting({ mode: 'slow' }).delayMs).toBe(DEFAULT_SLOW_DELAY_MS);
    expect(DEFAULT_SLOW_DELAY_MS).toBeGreaterThan(SSO_CALLBACK_TIMEOUT_MS);
  });

  it('slow makes handleCallback raise SsoUnavailableError when the deadline passes', async () => {
    const { request, callback } = await signIn(IITX, STUDENT.subject, STUDENT.password);
    sso.setFailureMode({ mode: 'slow', delayMs: 3_000 });
    const impatient = new MockSsoProvider({
      issuerBaseUrl: baseUrl,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      timeoutMs: 300,
    });

    const startedAt = Date.now();
    const rejection = impatient.handleCallback(IITX, callback, request);
    await expect(rejection).rejects.toBeInstanceOf(SsoUnavailableError);
    await expect(rejection).rejects.toMatchObject({ reason: 'timeout' });
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(290);
    expect(elapsed).toBeLessThan(3_000);
  });

  it('switches modes through the admin endpoint only with the admin token', async () => {
    const url = `${baseUrl}/__admin/failure-mode`;
    const put = (body: unknown, token?: string) =>
      fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });

    expect((await put({ mode: 'unavailable' })).status).toBe(401);
    expect((await put({ mode: 'unavailable' }, 'wrong-token')).status).toBe(401);
    expect(sso.getFailureMode().mode).toBe('none');

    const invalid = await put({ mode: 'down' }, ADMIN_TOKEN);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ field: 'mode' });

    const ok = await put({ mode: 'slow', delayMs: 12_000 }, ADMIN_TOKEN);
    expect(ok.status).toBe(200);
    expect(sso.getFailureMode()).toEqual({ mode: 'slow', delayMs: 12_000 });

    const current = await fetch(url, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(await current.json()).toEqual({ mode: 'slow', delayMs: 12_000 });
  });
});

describe('admin endpoint without an admin token', () => {
  it('does not exist', async () => {
    const hash = await hashPassword(STUDENT.password, FAST_SCRYPT);
    const closed = createMockSsoServer({
      clients: [{ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUris: [REDIRECT_TEMPLATE] }],
      seed: { tenants: [{ slug: IITX.slug, users: [{ subject: STUDENT.subject, passwordHash: hash }] }] },
    });
    const { url } = await closed.listen();
    try {
      const response = await fetch(`${url}/__admin/failure-mode`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
        body: JSON.stringify({ mode: 'unavailable' }),
      });
      expect(response.status).toBe(404);
      expect(closed.getFailureMode().mode).toBe('none');
    } finally {
      await closed.close();
    }
  });
});
