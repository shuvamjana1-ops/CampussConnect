/** The ERP did not answer in time or could not be reached. */
export class ErpUnavailableError extends Error {
  override readonly name = 'ErpUnavailableError';

  constructor(message = 'ERP is unavailable', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** A cursor passed to the adapter was not issued by it. */
export class ErpCursorError extends Error {
  override readonly name = 'ErpCursorError';

  constructor(message = 'Invalid ERP cursor') {
    super(message);
  }
}

/** A stored record does not have the shape the adapter expects. */
export class ErpRecordError extends Error {
  override readonly name = 'ErpRecordError';

  constructor(message: string) {
    super(message);
  }
}
