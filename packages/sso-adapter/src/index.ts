// @campusconnect/sso-adapter: SsoProvider interface and MockSsoProvider client.
export type { SsoAuthorizationRequest, SsoIdentity, SsoProvider, SsoProviderKind, TenantRef } from './sso-provider';
export {
  SsoAuthenticationFailedError,
  SsoCallbackError,
  SsoUnavailableError,
  type SsoCallbackFailure,
  type SsoUnavailableReason,
} from './errors';
export { MockSsoProvider, SSO_CALLBACK_TIMEOUT_MS, type MockSsoProviderOptions } from './mock-sso-provider';
