/**
 * The Tenant that a sign-in belongs to. `slug` is the Tenant's subdomain label (`{slug}.campusconnect.app`).
 * Identity_Service resolves it from the request host before sign-in starts.
 */
export interface TenantRef {
  readonly id: string;
  readonly slug: string;
}

/** Implementations of `SsoProvider`. Only `mock` exists in the first release (2.8). */
export type SsoProviderKind = 'mock' | 'oidc' | 'saml';

/** Result of starting a sign-in. Identity_Service stores `state` and `nonce` server-side for the callback. */
export interface SsoAuthorizationRequest {
  /** Where to redirect the browser to authenticate at the SSO_Provider (2.1). */
  readonly redirectUrl: string;
  /** Opaque value to store and pass back unchanged as `expected.state`. */
  readonly state: string;
  /** Opaque value to store and pass back unchanged as `expected.nonce`. */
  readonly nonce: string;
}

/** The authenticated identity returned by the SSO_Provider. */
export interface SsoIdentity {
  /** Stable id from the IdP. */
  externalSubject: string;
  /** Authentication methods used, for example `['pwd']` or `['pwd', 'otp']` (OIDC `amr`). */
  authMethods: string[];
}

/**
 * Authentication against an institution's SSO_Provider (2.1, 2.8, 2.10).
 * The first release ships `MockSsoProvider`; OIDC and SAML implementations plug into the same interface.
 */
export interface SsoProvider {
  readonly kind: SsoProviderKind;

  /**
   * Starts a sign-in for `tenant`.
   *
   * @param returnTo Absolute URL of the CampusConnect callback endpoint that the SSO_Provider
   *   redirects the browser back to (the OIDC `redirect_uri`).
   */
  buildAuthorizationRequest(tenant: TenantRef, returnTo: string): Promise<SsoAuthorizationRequest>;

  /**
   * Completes a sign-in from the callback query parameters.
   *
   * Rejects with `SsoUnavailableError` if the provider is unavailable or does not answer within 10 s (2.10),
   * with `SsoAuthenticationFailedError` if the provider rejected the user's credentials (counted for lockout, 2.9),
   * and with `SsoCallbackError` if the callback cannot be verified.
   */
  handleCallback(
    tenant: TenantRef,
    params: Record<string, string>,
    expected: { state: string; nonce: string },
  ): Promise<SsoIdentity>;
}
