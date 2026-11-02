import { ERROR_CATALOGUE, type ErrorCode, type FieldError, type ProblemExtensions } from '@campusconnect/contracts';

/**
 * An error that maps to one catalogue code. The message is the fixed catalogue title, so it never carries user
 * text or PII (19.6). `extensions` holds the members the code requires, such as `fields` for `VALIDATION_FAILED`.
 */
export class ApiError<C extends ErrorCode = ErrorCode> extends Error {
  constructor(
    readonly code: C,
    readonly extensions: ProblemExtensions<C>,
  ) {
    super(ERROR_CATALOGUE[code].title);
    this.name = 'ApiError';
  }

  static validation(fields: readonly FieldError[]): ApiError<'VALIDATION_FAILED'> {
    return new ApiError('VALIDATION_FAILED', { fields });
  }
}
