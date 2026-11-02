// @campusconnect/ai-adapter: AiAdapter interface, HuggingFaceAdapter, FakeAiAdapter and circuit breaker.
// The only package that calls an AI provider. All text input is RedactedText, verified before sending.

export { CircuitBreakerAdapter, type CircuitBreakerOptions } from './circuit-breaker';
export { EgressGuard } from './egress-guard';
export {
  AiError,
  ContextWindowExceededError,
  LlmError,
  RateLimitExceededError,
  UnverifiedTextError,
  type AiErrorCode,
} from './errors';
export { FakeAiAdapter, type FakeCall } from './fake-adapter';
export { HuggingFaceAdapter } from './huggingface-adapter';
export { PerTenantRateLimiter, type RateLimitConfig } from './rate-limiter';
export type { AiAdapter, AiCallLog, AiCallRecord, AiPurpose, CallOptions, JsonSchema, PurposeConfig } from './types';
