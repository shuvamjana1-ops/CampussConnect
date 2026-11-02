import { afterEach, describe, expect, it, vi } from 'vitest';

import { SsoAuthenticationFailedError, SsoCallbackError, SsoUnavailableError } from './errors';
import { MockSsoProvider, SSO_CALLBACK_TIMEOUT_MS, type MockSsoProviderOptions } from './mock-sso-provider';
import { mockIssuer, signIdToken, type MockIdTokenClaims } from './mock-protocol';
import type { TenantRef } from './sso-provider';

const BASE_URL = 'https://sso.example.test';
const CLIENT_ID = 'campusconnect';
const CLIENT_SECRET = 'test-client-secret-with-at-least-32-chars';
const CALLBACK = 'https://iitx.campusconnect.test/api/v1/auth/callback';
const TENANT: TenantRef = { id: 'tenant-1', slug: 'iitx' };
const NOW_MS = Date.UTC(2025, 0, 15, 10, 0, 0);
const NOW_S = NOW_MS / 1000;

interface RecordedCall {
  readonly url: string;
  readonly body: URLSearchParams;
  readonly signal: AbortSignal | undefined;
}

/** Stands in for the network: records each token request and answers with `respond`. */
function fakeNetwork(respond: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const call: RecordedCall = {
      url: input instanceof Request ? input.url : input.toString(),
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  };
  return { calls, fetchImpl };
}

function provider(overrides: Partial<MockSsoProviderOptions> = {}): MockSsoProvider {
  return new MockSsoProvider({
    issuerBaseUrl: BASE_URL,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    now: () => NOW_MS,
    ...overrides,
  });
}

function claims(nonce: string, overrides: Partial<MockIdTokenClaims> = {}): MockIdTokenClaims {
  return {
    iss: mockIssuer(BASE_URL, TENANT.slug),
    sub: 'STU-2024-0001',
    aud: CLIENT_ID,
    exp: NOW_S + 300,
    iat: NOW_S,
    auth_time: NOW_S,
    nonce,
    amr: ['pwd'],
    ...overrides,
  };
}

function tokenResponse(idToken: string, status = 200): Response {
  return new Response(JSON.stringify({ access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: idToken }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MockSsoProvider.buildAuthorizationRequest', () => {
  it('redirects to the tenant authorize endpoint with an OIDC code request', async () => {
    const request = await provider().buildAuthorizationRequest(TENANT, CALLBACK);
    const url = new URL(request.redirectUrl);

    expect(`${url.origin}${url.pathname}`).toBe(`${BASE_URL}/t/iitx/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK);
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('nonce')).toBe(request.nonce);
  });

  it('issues a fresh state and nonce for every request', async () => {
    const sso = provider();
    const first = await sso.buildAuthorizationRequest(TENANT, CALLBACK);
    const second = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.nonce.length).toBeGreaterThanOrEqual(43);
  });

  it('rejects an invalid tenant slug and a relative returnTo', async () => {
    const sso = provider();
    await expect(sso.buildAuthorizationRequest({ id: 't', slug: '../admin' }, CALLBACK)).rejects.toThrow(TypeError);
    await expect(sso.buildAuthorizationRequest(TENANT, '/api/v1/auth/callback')).rejects.toThrow(TypeError);
  });
});

describe('MockSsoProvider.handleCallback', () => {
  it('exchanges the code and returns the identity from a valid ID token', async () => {
    const network = fakeNetwork(() => tokenResponse(signIdToken(claims(request.nonce), CLIENT_SECRET)));
    const sso = provider({ fetch: network.fetchImpl });
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    const identity = await sso.handleCallback(TENANT, { code: 'c1', state: request.state }, request);

    expect(identity).toEqual({ externalSubject: 'STU-2024-0001', authMethods: ['pwd'] });
    expect(network.calls).toHaveLength(1);
    const call = network.calls[0];
    expect(call?.url).toBe(`${BASE_URL}/t/iitx/token`);
    expect(call?.body.get('grant_type')).toBe('authorization_code');
    expect(call?.body.get('code')).toBe('c1');
    expect(call?.body.get('redirect_uri')).toBe(CALLBACK);
    expect(call?.body.get('client_id')).toBe(CLIENT_ID);
  });

  it('rejects a state mismatch without calling the provider', async () => {
    const network = fakeNetwork(() => tokenResponse('unused'));
    const sso = provider({ fetch: network.fetchImpl });
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);
    const other = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    await expect(sso.handleCallback(TENANT, { code: 'c1', state: other.state }, request)).rejects.toMatchObject({
      failure: 'state_mismatch',
    });
    await expect(sso.handleCallback(TENANT, { code: 'c1' }, request)).rejects.toBeInstanceOf(SsoCallbackError);
    expect(network.calls).toHaveLength(0);
  });

  it('reports wrong credentials with the account hint so lockout can count them', async () => {
    const sso = provider();
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);
    const params = { error: 'access_denied', state: request.state, login_hint: 'STU-2024-0001' };

    const rejection = sso.handleCallback(TENANT, params, request);

    await expect(rejection).rejects.toBeInstanceOf(SsoAuthenticationFailedError);
    await expect(rejection).rejects.toMatchObject({ accountHint: 'STU-2024-0001' });
  });

  it('treats temporarily_unavailable on the callback as an unavailable provider', async () => {
    const sso = provider();
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    await expect(
      sso.handleCallback(TENANT, { error: 'temporarily_unavailable', state: request.state }, request),
    ).rejects.toMatchObject({ code: 'SSO_UNAVAILABLE', reason: 'provider_error' });
  });

  it('treats HTTP 503 and network failures from the token endpoint as an unavailable provider', async () => {
    const down = provider({ fetch: fakeNetwork(() => new Response('', { status: 503 })).fetchImpl });
    const downRequest = await down.buildAuthorizationRequest(TENANT, CALLBACK);
    await expect(down.handleCallback(TENANT, { code: 'c', state: downRequest.state }, downRequest)).rejects.toMatchObject(
      { reason: 'provider_error' },
    );

    const unreachable = provider({
      fetch: fakeNetwork(() => {
        throw new TypeError('fetch failed');
      }).fetchImpl,
    });
    const request = await unreachable.buildAuthorizationRequest(TENANT, CALLBACK);
    await expect(unreachable.handleCallback(TENANT, { code: 'c', state: request.state }, request)).rejects.toMatchObject({
      reason: 'network_error',
    });
  });

  it('rejects a refused code exchange', async () => {
    const sso = provider({
      fetch: fakeNetwork(() => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })).fetchImpl,
    });
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    await expect(sso.handleCallback(TENANT, { code: 'c', state: request.state }, request)).rejects.toMatchObject({
      failure: 'token_rejected',
    });
  });

  it.each([
    ['a wrong nonce', (nonce: string) => signIdToken(claims(`${nonce}x`), CLIENT_SECRET)],
    ['another tenant issuer', (nonce: string) => signIdToken(claims(nonce, { iss: mockIssuer(BASE_URL, 'other') }), CLIENT_SECRET)],
    ['another audience', (nonce: string) => signIdToken(claims(nonce, { aud: 'someone-else' }), CLIENT_SECRET)],
    ['an expired token', (nonce: string) => signIdToken(claims(nonce, { exp: NOW_S - 120 }), CLIENT_SECRET)],
    ['an empty subject', (nonce: string) => signIdToken(claims(nonce, { sub: '' }), CLIENT_SECRET)],
    ['a wrong signing key', (nonce: string) => signIdToken(claims(nonce), 'another-secret-another-secret-12345')],
    [
      'alg none',
      (nonce: string) => `${base64UrlJson({ alg: 'none', typ: 'JWT' })}.${base64UrlJson(claims(nonce))}.`,
    ],
  ])('rejects an ID token with %s', async (_label, makeToken) => {
    const network = fakeNetwork(() => tokenResponse(makeToken(request.nonce)));
    const sso = provider({ fetch: network.fetchImpl });
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    await expect(sso.handleCallback(TENANT, { code: 'c', state: request.state }, request)).rejects.toMatchObject({
      failure: 'invalid_id_token',
    });
  });

  it('raises SsoUnavailableError after exactly 10 seconds and aborts the request', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const sso = provider({ fetch: hanging });
    const request = await sso.buildAuthorizationRequest(TENANT, CALLBACK);

    let settled = false;
    const pending = sso.handleCallback(TENANT, { code: 'c', state: request.state }, request);
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    expect(SSO_CALLBACK_TIMEOUT_MS).toBe(10_000);
    await vi.advanceTimersByTimeAsync(SSO_CALLBACK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toBeInstanceOf(SsoUnavailableError);
    await expect(pending).rejects.toMatchObject({ reason: 'timeout' });
    expect(settled).toBe(true);
    expect(aborted).toBe(true);
  });
});
