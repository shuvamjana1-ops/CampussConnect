/**
 * AI-specific error types. These are runtime errors from the AI adapter and its providers,
 * distinct from application error codes (VALIDATION_FAILED, etc.) that are returned in HTTP responses.
 */

export type AiErrorCode = 'RATE_LIMIT_EXCEEDED' | 'CONTEXT_WINDOW_EXCEEDED' | 'AI_ERROR' | 'UNVERIFIED_TEXT';

export interface AiErrorInfo {
  readonly code: AiErrorCode;
  readonly title: string;
}

/** AI adapter errors, not returned to clients but logged and counted in metrics. */
export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    Object.setPrototypeOf(this, AiError.prototype);
  }
}

export class RateLimitExceededError extends AiError {
  constructor(message: string, readonly retryAfterSeconds?: number) {
    super('RATE_LIMIT_EXCEEDED', message);
    this.name = 'RateLimitExceededError';
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

export class ContextWindowExceededError extends AiError {
  constructor(message: string, readonly maxTokens?: number) {
    super('CONTEXT_WINDOW_EXCEEDED', message);
    this.name = 'ContextWindowExceededError';
    Object.setPrototypeOf(this, ContextWindowExceededError.prototype);
  }
}

export class LlmError extends AiError {
  constructor(message: string, readonly statusCode?: number) {
    super('AI_ERROR', message);
    this.name = 'LlmError';
    Object.setPrototypeOf(this, LlmError.prototype);
  }
}

export class UnverifiedTextError extends AiError {
  constructor(message: string) {
    super('UNVERIFIED_TEXT', message);
    this.name = 'UnverifiedTextError';
    Object.setPrototypeOf(this, UnverifiedTextError.prototype);
  }
}
