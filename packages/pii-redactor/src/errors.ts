/**
 * Redaction errors. Callers that receive any of them must not call the AI_Adapter (5.3).
 * Messages contain only fixed text and codes, never input text or Tenant data (19.6).
 */

export type RedactionErrorCode = "REDACTION_TIMEOUT" | "REDACTION_FAILED";

export type RedactionFailureReason =
  /** The gazetteer or roll-number pattern provider failed. */
  | "CONFIG_UNAVAILABLE"
  /** A Tenant roll-number pattern is not valid RE2 syntax. */
  | "INVALID_TENANT_PATTERN"
  /** The staff thread could not start, crashed, or sent an invalid response. */
  | "WORKER_FAILED"
  /** `close()` was called on the redactor. */
  | "REDACTOR_CLOSED";

export class RedactionError extends Error {
  readonly code: RedactionErrorCode;

  constructor(code: RedactionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Redaction did not finish before its deadline (2 seconds by default). */
export class RedactionTimeoutError extends RedactionError {
  override readonly name = "RedactionTimeoutError";
  readonly deadlineMs: number;

  constructor(deadlineMs: number) {
    super(
      "REDACTION_TIMEOUT",
      `PII redaction did not complete within ${String(deadlineMs)} ms`,
    );
    this.deadlineMs = deadlineMs;
  }
}

/** Redaction failed for a reason other than the deadline. */
export class RedactionFailedError extends RedactionError {
  override readonly name = "RedactionFailedError";
  readonly reason: RedactionFailureReason;

  constructor(reason: RedactionFailureReason) {
    super("REDACTION_FAILED", `PII redaction failed: ${reason}`);
    this.reason = reason;
  }
}
