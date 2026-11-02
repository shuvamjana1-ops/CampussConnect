// @campusconnect/server/identity: sign-in, MFA and sessions.

export {
  IdentityService,
  requiresMfa,
  ERP_PREFILL_TIMEOUT_MS,
  MFA_CHALLENGE_TTL_SECONDS,
  SSO_STATE_TTL_SECONDS,
  type IdentityServiceDeps,
  type MfaEnrollment,
  type SignInResult,
} from './identity.service';
export { IdentityRepository, type MfaFactorRecord, type UserRecord } from './identity.repository';
export { AuthRoutes, type AuthRequest, type AuthResponse } from './auth-routes';
export { NodeTotpEngine, base32Decode, base32Encode } from './totp';
export { ValkeySessionStore, type ValkeyClient } from './valkey-session-store';
export { SESSION_COOKIE_NAME, clearSessionCookie, readSessionCookie, sessionCookie } from './session-cookie';
export {
  IdentityError,
  type AuthAuditSink,
  type AuthEvent,
  type AuthEventAction,
  type ErpPort,
  type ErpStudentRecord,
  type IdentityDatabase,
  type IdentityErrorCode,
  type IdentitySqlClient,
  type IdleTimeoutProvider,
  type SecretCipher,
  type Session,
  type SessionStore,
  type SsoPort,
  type TenantRef,
  type TotpEngine,
} from './identity.types';
