import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  MOCK_ACCOUNT_HINT_PARAM,
  MOCK_ID_TOKEN_ALG,
  MOCK_INVALID_CREDENTIALS,
  OAUTH_ERRORS,
  constantTimeEqual,
  isValidTenantSlug,
  mockEndpoints,
  mockIssuer,
  signIdToken,
} from '@campusconnect/sso-adapter/mock-protocol';

import { isRegisteredRedirectUri, validateConfig, type ClientRegistration, type MockSsoServerConfig } from './config';
import { FailureModeError, NORMAL_OPERATION, parseFailureModeSetting, type FailureModeSetting } from './failure-modes';
import { renderErrorPage, renderLoginPage, type AuthorizeParams } from './login-page';
import { MAX_PASSWORD_LENGTH, verifyPassword } from './passwords';
import { UserDirectory, type DirectoryUser } from './seed';

const DEFAULT_CODE_TTL_SECONDS = 60;
const DEFAULT_ID_TOKEN_TTL_SECONDS = 300;
const MAX_FORM_BYTES = 16 * 1024;
const MAX_ADMIN_BODY_BYTES = 1024;
const MAX_STATE_LENGTH = 4096;
const MAX_NONCE_LENGTH = 512;
const MAX_USERNAME_LENGTH = 255;
const MAX_PENDING_CODES = 10_000;
const TENANT_PATH = /^\/t\/([^/]+)(\/.*)$/;
const LOGIN_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";

export interface MockSsoServer {
  readonly server: Server;
  /** Starts listening. Defaults to an ephemeral port on 127.0.0.1. */
  listen(port?: number, host?: string): Promise<{ readonly port: number; readonly url: string }>;
  close(): Promise<void>;
  getFailureMode(): FailureModeSetting;
  setFailureMode(setting: FailureModeSetting): void;
}

interface PendingCode {
  readonly slug: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly nonce: string;
  readonly subject: string;
  readonly authMethods: readonly string[];
  readonly authTimeSeconds: number;
  readonly expiresAtMs: number;
}

type AuthorizeValidation =
  | { readonly kind: 'no_redirect'; readonly message: string }
  | { readonly kind: 'error'; readonly redirectUri: string; readonly state: string | undefined; readonly error: string }
  | { readonly kind: 'ok'; readonly redirectUri: string; readonly state: string; readonly params: AuthorizeParams };

class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError';
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    req.on('data', (chunk: Buffer) => {
      if (finished) {
        return;
      }
      size += chunk.length;
      if (size > limit) {
        finished = true;
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!finished) {
        finished = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (error) => {
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
  });
}

function hasContentType(req: IncomingMessage, type: string): boolean {
  const value = req.headers['content-type'] ?? '';
  return value.split(';')[0]?.trim().toLowerCase() === type;
}

function setCommonHeaders(res: ServerResponse): void {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('content-security-policy', LOGIN_PAGE_CSP);
  res.setHeader('x-frame-options', 'DENY');
  res.end(html);
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader('allow', allow);
  sendJson(res, 405, { error: 'method_not_allowed' });
}

function redirectTo(
  res: ServerResponse,
  status: 302 | 303,
  redirectUri: string,
  params: Record<string, string | undefined>,
): void {
  const target = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) {
      target.searchParams.set(name, value);
    }
  }
  res.statusCode = status;
  res.setHeader('location', target.toString());
  res.end();
}

class MockSso implements MockSsoServer {
  readonly server: Server;

  readonly #issuerBaseUrl: string | undefined;
  readonly #clients: ReadonlyMap<string, ClientRegistration>;
  readonly #directory: UserDirectory;
  readonly #adminToken: string | undefined;
  readonly #codeTtlSeconds: number;
  readonly #idTokenTtlSeconds: number;
  readonly #now: () => number;
  readonly #codes = new Map<string, PendingCode>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #failureMode: FailureModeSetting;
  #listenUrl: string | undefined;

  constructor(config: MockSsoServerConfig) {
    validateConfig(config);
    this.#issuerBaseUrl = config.issuerBaseUrl;
    this.#clients = new Map(config.clients.map((client) => [client.clientId, client] as const));
    this.#directory = new UserDirectory(config.seed);
    this.#adminToken = config.adminToken;
    this.#codeTtlSeconds = config.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS;
    this.#idTokenTtlSeconds = config.idTokenTtlSeconds ?? DEFAULT_ID_TOKEN_TTL_SECONDS;
    this.#now = config.now ?? (() => Date.now());
    this.#failureMode = parseFailureModeSetting(config.initialFailureMode ?? NORMAL_OPERATION);
    this.server = createServer((req, res) => {
      void this.#handle(req, res);
    });
  }

  listen(port = 0, host = '127.0.0.1'): Promise<{ readonly port: number; readonly url: string }> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(error);
      };
      this.server.once('error', onError);
      this.server.listen(port, host, () => {
        this.server.off('error', onError);
        const address = this.server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('Server is not listening on a TCP port'));
          return;
        }
        const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
        const url = `http://${urlHost}:${String(address.port)}`;
        this.#listenUrl = url;
        resolve({ port: address.port, url });
      });
    });
  }

  close(): Promise<void> {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    return new Promise((resolve, reject) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      this.server.closeAllConnections();
    });
  }

  getFailureMode(): FailureModeSetting {
    return this.#failureMode;
  }

  setFailureMode(setting: FailureModeSetting): void {
    this.#failureMode = parseFailureModeSetting(setting);
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      setCommonHeaders(res);
      const url = new URL(req.url ?? '/', 'http://mock-sso.invalid');
      const path = url.pathname;
      if (path === '/health') {
        sendJson(res, 200, { status: 'ok' });
        return;
      }
      if (path === '/__admin/failure-mode') {
        await this.#admin(req, res);
        return;
      }
      const match = TENANT_PATH.exec(path);
      const slug = match?.[1];
      const endpoint = match?.[2];
      if (slug !== undefined && isValidTenantSlug(slug) && this.#directory.hasTenant(slug)) {
        if (endpoint === '/.well-known/openid-configuration') {
          await this.#discovery(req, res, slug);
          return;
        }
        if (endpoint === '/authorize') {
          await this.#authorize(req, res, slug, url);
          return;
        }
        if (endpoint === '/token') {
          await this.#token(req, res, slug);
          return;
        }
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.setHeader('connection', 'close');
      if (error instanceof BodyTooLargeError) {
        sendJson(res, 413, { error: OAUTH_ERRORS.invalidRequest });
        return;
      }
      sendJson(res, 500, { error: OAUTH_ERRORS.serverError });
    }
  }

  /** Applies the `slow` delay and returns the failure mode that governs this request. */
  async #gate(): Promise<FailureModeSetting> {
    const setting = this.#failureMode;
    if (setting.mode === 'slow') {
      await this.#delay(setting.delayMs);
    }
    return setting;
  }

  #delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#timers.delete(timer);
        resolve();
      }, ms);
      this.#timers.add(timer);
    });
  }

  #issuer(slug: string): string {
    const base = this.#issuerBaseUrl ?? this.#listenUrl;
    if (base === undefined) {
      throw new Error('Issuer base URL is unknown until the server listens');
    }
    return mockIssuer(base, slug);
  }

  async #discovery(req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET');
      return;
    }
    const setting = await this.#gate();
    if (setting.mode === 'unavailable') {
      sendJson(res, 503, { error: OAUTH_ERRORS.temporarilyUnavailable });
      return;
    }
    const issuer = this.#issuer(slug);
    const endpoints = mockEndpoints(issuer);
    sendJson(res, 200, {
      issuer,
      authorization_endpoint: endpoints.authorization,
      token_endpoint: endpoints.token,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      scopes_supported: ['openid'],
      id_token_signing_alg_values_supported: [MOCK_ID_TOKEN_ALG],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'amr'],
    });
  }

  #validateAuthorizeRequest(slug: string, params: URLSearchParams): AuthorizeValidation {
    const clientId = params.get('client_id') ?? '';
    const client = this.#clients.get(clientId);
    if (client === undefined) {
      return { kind: 'no_redirect', message: 'Unknown client.' };
    }
    const redirectUri = params.get('redirect_uri') ?? '';
    if (!isRegisteredRedirectUri(client, slug, redirectUri)) {
      return { kind: 'no_redirect', message: 'The redirect URI is not registered for this client.' };
    }
    const stateParam = params.get('state') ?? '';
    const state = stateParam !== '' && stateParam.length <= MAX_STATE_LENGTH ? stateParam : undefined;
    if (params.get('response_type') !== 'code') {
      return { kind: 'error', redirectUri, state, error: OAUTH_ERRORS.unsupportedResponseType };
    }
    const scope = params.get('scope') ?? '';
    if (!scope.split(' ').includes('openid')) {
      return { kind: 'error', redirectUri, state, error: OAUTH_ERRORS.invalidScope };
    }
    const nonce = params.get('nonce') ?? '';
    if (state === undefined || nonce === '' || nonce.length > MAX_NONCE_LENGTH) {
      return { kind: 'error', redirectUri, state, error: OAUTH_ERRORS.invalidRequest };
    }
    return {
      kind: 'ok',
      redirectUri,
      state,
      params: { response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope, state, nonce },
    };
  }

  async #authorize(req: IncomingMessage, res: ServerResponse, slug: string, url: URL): Promise<void> {
    let params: URLSearchParams;
    if (req.method === 'GET') {
      params = url.searchParams;
    } else if (req.method === 'POST') {
      if (!hasContentType(req, 'application/x-www-form-urlencoded')) {
        sendHtml(res, 415, renderErrorPage('Unsupported content type.'));
        return;
      }
      params = new URLSearchParams(await readBody(req, MAX_FORM_BYTES));
    } else {
      methodNotAllowed(res, 'GET, POST');
      return;
    }
    const redirectStatus = req.method === 'POST' ? 303 : 302;

    const setting = await this.#gate();
    const request = this.#validateAuthorizeRequest(slug, params);
    if (request.kind === 'no_redirect') {
      sendHtml(res, 400, renderErrorPage(request.message));
      return;
    }
    if (setting.mode === 'unavailable') {
      redirectTo(res, redirectStatus, request.redirectUri, {
        error: OAUTH_ERRORS.temporarilyUnavailable,
        state: request.state,
      });
      return;
    }
    if (request.kind === 'error') {
      redirectTo(res, redirectStatus, request.redirectUri, { error: request.error, state: request.state });
      return;
    }
    if (req.method === 'GET') {
      sendHtml(res, 200, renderLoginPage(slug, request.params));
      return;
    }

    const username = (params.get('username') ?? '').trim();
    const password = params.get('password') ?? '';
    const user = await this.#authenticate(slug, username, password, setting);
    if (user === undefined) {
      redirectTo(res, 303, request.redirectUri, {
        error: OAUTH_ERRORS.accessDenied,
        error_description: MOCK_INVALID_CREDENTIALS,
        state: request.state,
        [MOCK_ACCOUNT_HINT_PARAM]: username !== '' && username.length <= MAX_USERNAME_LENGTH ? username : undefined,
      });
      return;
    }
    const code = this.#issueCode({
      slug,
      clientId: request.params.client_id,
      redirectUri: request.redirectUri,
      nonce: request.params.nonce,
      subject: user.subject,
      authMethods: user.authMethods,
    });
    redirectTo(res, 303, request.redirectUri, { code, state: request.state });
  }

  /**
   * Checks credentials against the Tenant's seeded users. Unknown users are checked against a seeded hash
   * so that they take as long as known users; `wrong_password` mode fails every check.
   */
  async #authenticate(
    slug: string,
    username: string,
    password: string,
    setting: FailureModeSetting,
  ): Promise<DirectoryUser | undefined> {
    const user =
      username !== '' && username.length <= MAX_USERNAME_LENGTH ? this.#directory.findUser(slug, username) : undefined;
    const hash = user?.passwordHash ?? this.#directory.sampleHash();
    const passwordOk =
      hash !== undefined && password.length <= MAX_PASSWORD_LENGTH ? await verifyPassword(password, hash) : false;
    return user !== undefined && passwordOk && setting.mode !== 'wrong_password' ? user : undefined;
  }

  #issueCode(grant: Omit<PendingCode, 'authTimeSeconds' | 'expiresAtMs'>): string {
    const now = this.#now();
    for (const [code, pending] of this.#codes) {
      if (pending.expiresAtMs <= now) {
        this.#codes.delete(code);
      }
    }
    const code = randomBytes(32).toString('base64url');
    this.#codes.set(code, {
      ...grant,
      authTimeSeconds: Math.floor(now / 1000),
      expiresAtMs: now + this.#codeTtlSeconds * 1000,
    });
    while (this.#codes.size > MAX_PENDING_CODES) {
      const oldest = this.#codes.keys().next();
      if (oldest.done) {
        break;
      }
      this.#codes.delete(oldest.value);
    }
    return code;
  }

  async #token(req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST');
      return;
    }
    if (!hasContentType(req, 'application/x-www-form-urlencoded')) {
      sendJson(res, 400, { error: OAUTH_ERRORS.invalidRequest });
      return;
    }
    const body = new URLSearchParams(await readBody(req, MAX_FORM_BYTES));
    const setting = await this.#gate();
    if (setting.mode === 'unavailable') {
      sendJson(res, 503, { error: OAUTH_ERRORS.temporarilyUnavailable });
      return;
    }

    const client = this.#clients.get(body.get('client_id') ?? '');
    const secret = body.get('client_secret') ?? '';
    if (client === undefined || !constantTimeEqual(secret, client.clientSecret)) {
      sendJson(res, 401, { error: OAUTH_ERRORS.invalidClient });
      return;
    }
    if (body.get('grant_type') !== 'authorization_code') {
      sendJson(res, 400, { error: OAUTH_ERRORS.unsupportedGrantType });
      return;
    }

    // A code is single use: it is removed on first presentation, even if the request is otherwise invalid.
    const code = body.get('code') ?? '';
    const pending = this.#codes.get(code);
    this.#codes.delete(code);
    const now = this.#now();
    if (
      pending === undefined ||
      pending.expiresAtMs <= now ||
      pending.slug !== slug ||
      pending.clientId !== client.clientId ||
      pending.redirectUri !== body.get('redirect_uri')
    ) {
      sendJson(res, 400, { error: OAUTH_ERRORS.invalidGrant });
      return;
    }

    const nowSeconds = Math.floor(now / 1000);
    const idToken = signIdToken(
      {
        iss: this.#issuer(slug),
        sub: pending.subject,
        aud: client.clientId,
        exp: nowSeconds + this.#idTokenTtlSeconds,
        iat: nowSeconds,
        auth_time: pending.authTimeSeconds,
        nonce: pending.nonce,
        amr: pending.authMethods,
      },
      client.clientSecret,
    );
    sendJson(res, 200, {
      access_token: randomBytes(32).toString('base64url'),
      token_type: 'Bearer',
      expires_in: this.#idTokenTtlSeconds,
      id_token: idToken,
    });
  }

  async #admin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const adminToken = this.#adminToken;
    if (adminToken === undefined) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!constantTimeEqual(presented, adminToken)) {
      res.setHeader('www-authenticate', 'Bearer');
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, this.#failureMode);
      return;
    }
    if (req.method !== 'PUT') {
      methodNotAllowed(res, 'GET, PUT');
      return;
    }
    if (!hasContentType(req, 'application/json')) {
      sendJson(res, 415, { error: 'unsupported_media_type' });
      return;
    }
    const text = await readBody(req, MAX_ADMIN_BODY_BYTES);
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      sendJson(res, 400, { error: OAUTH_ERRORS.invalidRequest, field: '' });
      return;
    }
    try {
      this.setFailureMode(parseFailureModeSetting(input));
    } catch (error) {
      if (error instanceof FailureModeError) {
        sendJson(res, 400, { error: OAUTH_ERRORS.invalidRequest, field: error.field, message: error.message });
        return;
      }
      throw error;
    }
    sendJson(res, 200, this.#failureMode);
  }
}

/**
 * Creates the OIDC-shaped mock SSO_Provider (2.1, 2.8). Each seeded Tenant gets an issuer at `/t/{slug}` with
 * a discovery document, an authorize endpoint with a login form, and a token endpoint. Failure modes are
 * switched with `setFailureMode` or, when an admin token is configured, `PUT /__admin/failure-mode` (2.9, 2.10).
 */
export function createMockSsoServer(config: MockSsoServerConfig): MockSsoServer {
  return new MockSso(config);
}
