/** Why the SSO_Provider counts as unavailable. */
export type SsoUnavailableReason =
  /** No complete answer within the 10-second deadline (2.10). */
  | 'timeout'
  /** The provider could not be reached. */
  | 'network_error'
  /** The provider reported that it is unavailable (HTTP 5xx or 429, or `temporarily_unavailable`). */
  | 'provider_error';

/**
 * The SSO_Provider is unavailable or did not respond within 10 seconds (2.10).
 * Identity_Service denies sign-in with `SSO_UNAVAILABLE` and creates no session.
 */
export class SsoUnavailableError extends Error {
  override readonly name = 'SsoUnavailableError';
  readonly code = 'SSO_UNAVAILABLE';
  readonly reason: SsoUnavailableReason;

  constructor(reason: SsoUnavailableReason, options?: ErrorOptions) {
    super(`SSO provider unavailable: ${reason}`, options);
    this.reason = reason;
  }
}

/**
 * The SSO_Provider rejected the user's credentials. Identity_Service counts this as a failed attempt (2.9).
 */
export class SsoAuthenticationFailedError extends Error {
  override readonly name = 'SsoAuthenticationFailedError';
  readonly code = 'SSO_AUTHENTICATION_FAILED';
  /**
   * The account name the user typed, when the provider reports it. It arrives on the front channel,
   * so it carries the same trust as a typed username: use it to count failures, never to sign anyone in.
   */
  readonly accountHint: string | undefined;

  constructor(accountHint: string | undefined) {
    super('SSO provider rejected the credentials');
    this.accountHint = accountHint;
  }
}

/** Why a callback could not be verified. */
export type SsoCallbackFailure =
  /** The callback `state` does not match the stored state, or the stored state was not issued by this provider. */
  | 'state_mismatch'
  /** The callback has neither an authorization code nor an error. */
  | 'missing_code'
  /** The provider redirected back with an error other than a credential or availability failure. */
  | 'provider_error_response'
  /** The token endpoint refused the code exchange (for example a reused or expired code). */
  | 'token_rejected'
  /** The token endpoint answered with a body that is not a valid token response. */
  | 'invalid_token_response'
  /** The ID token signature, issuer, audience, expiry, nonce or subject is invalid. */
  | 'invalid_id_token';

/** The callback could not be verified. Sign-in is denied and no session is created. */
export class SsoCallbackError extends Error {
  override readonly name = 'SsoCallbackError';
  readonly code = 'SSO_CALLBACK_INVALID';
  readonly failure: SsoCallbackFailure;

  constructor(failure: SsoCallbackFailure, options?: ErrorOptions) {
    super(`SSO callback rejected: ${failure}`, options);
    this.failure = failure;
  }
}
