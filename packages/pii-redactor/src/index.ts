// @campusconnect/pii-redactor: PII detection and redaction (5.1, 5.2, 5.3, 19.6).
// The RedactedText brand and its mint function live in src/internal/, which dependency-cruiser keeps
// private to this package. Only redact() results are minted.
export type { RedactedText } from './internal/mint';
export { isRedactedText } from './internal/mint';
export {
  RedactionError,
  RedactionFailedError,
  RedactionTimeoutError,
  type RedactionErrorCode,
  type RedactionFailureReason,
} from './errors';
export { PII_TYPES, placeholderFor, type PiiPlaceholder, type PiiType, type RedactionSpan } from './pii-types';
export {
  StaticGazetteerProvider,
  StaticRollNumberPatternProvider,
  type Gazetteer,
  type GazetteerName,
  type GazetteerProvider,
  type RollNumberPatternProvider,
} from './providers';
export {
  createPiiRedactor,
  DEFAULT_DEADLINE_MS,
  WorkerPiiRedactor,
  type PiiRedactor,
  type RedactionContext,
  type RedactionResult,
  type WorkerPiiRedactorOptions,
} from './redactor';
