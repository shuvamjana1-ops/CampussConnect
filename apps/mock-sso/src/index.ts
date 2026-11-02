// @campusconnect/mock-sso: OIDC-shaped mock SSO_Provider for development and the first release.
export {
  ConfigError,
  configFromEnv,
  type ClientRegistration,
  type MockSsoServerConfig,
} from './config';
export {
  DEFAULT_SLOW_DELAY_MS,
  FAILURE_MODES,
  NORMAL_OPERATION,
  type FailureMode,
  type FailureModeSetting,
} from './failure-modes';
export { DEFAULT_SCRYPT_PARAMS, hashPassword, type ScryptParams } from './passwords';
export { SeedError, loadSeedFile, parseSeed, type MockSsoSeed, type SeedTenant, type SeedUser } from './seed';
export { createMockSsoServer, type MockSsoServer } from './server';
