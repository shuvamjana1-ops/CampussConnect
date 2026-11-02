import { randomBytes } from 'node:crypto';

import { SsoAuthenticationFailedError, SsoCallbackError, SsoUnavailableError } from './errors';
import {
  MOCK_ACCOUNT_HINT_PARAM,
  OAUTH_ERRORS,
  constantTimeEqual,
  mockEndpoints,
  mockIssuer,
  verifyIdTokenSignature,
} from './mock-protocol';
import type { SsoAuthorizationRequest, SsoIdentity, SsoProvider, TenantRef } from './sso-provider';

/** Deadline for completing a callback against the SSO_Provider (2.10). */
export const SSO_CALLBACK_TIMEOUT_MS = 10_000;

/** Tolerated clock difference when checking `exp` and `iat`. */
const CLOCK_SKEW_SECONDS = 60;

/** OIDC limits `sub` to 255 ASCII characters. */
const MAX_SUBJECT_LENGTH = 255;

export interface MockSsoProviderOptions {
  /** Public base URL of `apps/mock-sso`, for example `https://sso.example.test`. Tenant issuers live under `/t/{slug}`. */
  readonly issuerBaseUrl: string;
  readonly clientId: string;
  /** Client secret, also the ID token signing key. Read it from Secrets Manager; never log it. */
  readonly clientSecret: string;
  /** Deadline for `handleCallback`. Defaults to `SSO_CALLBACK_TIMEOUT_MS` (10 s, 2.10). */
  readonly timeoutMs?: number;
  /** HTTP client. Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Clock in epoch milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function parseHttpUrl(value: string): URL | undefined {
  if (!URL.canParse(value)) {
    return undefined;
  }
  const url = new URL(value);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
}

/**
 * The token request must repeat the `redirect_uri` of the authorization request, but `handleCallback`
 * only receives the stored state. The state therefore carries the redirect URI after the random part,
 * which keeps the provider stateless. The stored state is trusted because Identity_Service keeps it server-side.
 */
function encodeState(redirectUri: string): string {
  return `${randomToken()}.${Buffer.from(redirectUri, 'utf8').toString('base64url')}`;
}

function redirectUriFromState(state: string): string | undefined {
  const separator = state.indexOf('.');
  if (separator <= 0) {
    return undefined;
  }
  const encoded = state.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return undefined;
  }
  const redirectUri = Buffer.from(encoded, 'base64url').toString('utf8');
  return parseHttpUrl(redirectUri) === undefined ? undefined : redirectUri;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * `SsoProvider` client for the OIDC-shaped mock SSO_Provider in `apps/mock-sso` (2.8).
 *
 * `handleCallback` exchanges the authorization code at the Tenant's token endpoint and verifies the ID token.
 * The whole exchange runs under a 10-second deadline: when it passes, the request is aborted and the call
 * rejects with `SsoUnavailableError` (2.10).
 */
export class MockSsoProvider implements SsoProvider {
  readonly kind = 'mock';

  readonly #issuerBaseUrl: string;
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;

  constructor(options: MockSsoProviderOptions) {
    if (parseHttpUrl(options.issuerBaseUrl) === undefined) {
      throw new TypeError('issuerBaseUrl must be an absolute http(s) URL');
    }
    if (options.clientId === '' || options.clientSecret === '') {
      throw new TypeError('clientId and clientSecret are required');
    }
    const timeoutMs = options.timeoutMs ?? SSO_CALLBACK_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive whole number of milliseconds');
    }
    this.#issuerBaseUrl = options.issuerBaseUrl;
    this.#clientId = options.clientId;
    this.#clientSecret = options.clientSecret;
    this.#timeoutMs = timeoutMs;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => Date.now());
  }

  buildAuthorizationRequest(tenant: TenantRef, returnTo: string): Promise<SsoAuthorizationRequest> {
    return new Promise((resolve) => {
      const issuer = mockIssuer(this.#issuerBaseUrl, tenant.slug);
      if (parseHttpUrl(returnTo) === undefined) {
        throw new TypeError('returnTo must be an absolute http(s) URL');
      }
      const state = encodeState(returnTo);
      const nonce = randomToken();
      const url = new URL(mockEndpoints(issuer).authorization);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: this.#clientId,
        redirect_uri: returnTo,
        scope: 'openid',
        state,
        nonce,
      }).toString();
      resolve({ redirectUrl: url.toString(), state, nonce });
    });
  }

  async handleCallback(
    tenant: TenantRef,
    params: Record<string, string>,
    expected: { state: string; nonce: string },
  ): Promise<SsoIdentity> {
    const issuer = mockIssuer(this.#issuerBaseUrl, tenant.slug);

    const state = params.state;
    if (state === undefined || !constantTimeEqual(state, expected.state)) {
      throw new SsoCallbackError('state_mismatch');
    }
    const redirectUri = redirectUriFromState(expected.state);
    if (redirectUri === undefined) {
      throw new SsoCallbackError('state_mismatch');
    }

    const error = params.error;
    if (error !== undefined) {
      if (error === OAUTH_ERRORS.accessDenied) {
        throw new SsoAuthenticationFailedError(params[MOCK_ACCOUNT_HINT_PARAM]);
      }
      if (error === OAUTH_ERRORS.temporarilyUnavailable || error === OAUTH_ERRORS.serverError) {
        throw new SsoUnavailableError('provider_error');
      }
      throw new SsoCallbackError('provider_error_response');
    }

    const code = params.code;
    if (code === undefined || code === '') {
      throw new SsoCallbackError('missing_code');
    }

    return await this.#withDeadline((signal) =>
      this.#exchangeCode({ issuer, code, redirectUri, nonce: expected.nonce, signal }),
    );
  }

  /** Runs `task` with an abort signal and rejects with `SsoUnavailableError` once the deadline passes. */
  async #withDeadline<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SsoUnavailableError('timeout'));
      }, this.#timeoutMs);
    });
    try {
      return await Promise.race([task(controller.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #exchangeCode(input: {
    issuer: string;
    code: string;
    redirectUri: string;
    nonce: string;
    signal: AbortSignal;
  }): Promise<SsoIdentity> {
    const { issuer, code, redirectUri, nonce, signal } = input;

    const fetchImpl = this.#fetch;
    let response: Response;
    try {
      response = await fetchImpl(mockEndpoints(issuer).token, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: this.#clientId,
          client_secret: this.#clientSecret,
        }).toString(),
        redirect: 'error',
        signal,
      });
    } catch (cause) {
      throw new SsoUnavailableError(signal.aborted ? 'timeout' : 'network_error', { cause });
    }

    if (response.status >= 500 || response.status === 429) {
      throw new SsoUnavailableError('provider_error');
    }
    if (!response.ok) {
      throw new SsoCallbackError('token_rejected');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      if (signal.aborted) {
        throw new SsoUnavailableError('timeout', { cause });
      }
      throw new SsoCallbackError('invalid_token_response', { cause });
    }
    if (typeof body !== 'object' || body === null || !('id_token' in body) || typeof body.id_token !== 'string') {
      throw new SsoCallbackError('invalid_token_response');
    }

    return this.#verifyIdToken(body.id_token, issuer, nonce);
  }

  #verifyIdToken(idToken: string, issuer: string, nonce: string): SsoIdentity {
    const claims = verifyIdTokenSignature(idToken, this.#clientSecret);
    if (claims === undefined) {
      throw new SsoCallbackError('invalid_id_token');
    }
    const nowSeconds = Math.floor(this.#now() / 1000);
    const { iss, aud, azp, exp, iat, sub, amr } = claims;
    const audienceOk =
      aud === this.#clientId ||
      (isStringArray(aud) && aud.includes(this.#clientId) && (aud.length === 1 || azp === this.#clientId));
    const timeOk =
      typeof exp === 'number' &&
      exp > nowSeconds - CLOCK_SKEW_SECONDS &&
      typeof iat === 'number' &&
      iat <= nowSeconds + CLOCK_SKEW_SECONDS;
    const nonceOk = typeof claims.nonce === 'string' && constantTimeEqual(claims.nonce, nonce);
    if (iss !== issuer || !audienceOk || !timeOk || !nonceOk) {
      throw new SsoCallbackError('invalid_id_token');
    }
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > MAX_SUBJECT_LENGTH) {
      throw new SsoCallbackError('invalid_id_token');
    }
    let authMethods: string[] = [];
    if (amr !== undefined) {
      if (!isStringArray(amr)) {
        throw new SsoCallbackError('invalid_id_token');
      }
      authMethods = [...amr];
    }
    return { externalSubject: sub, authMethods };
  }
}
