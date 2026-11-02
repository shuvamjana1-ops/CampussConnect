import type { RedactedText } from '@campusconnect/pii-redactor';
import type { AiError } from './errors';

/**
 * AI purpose: the reason for calling the provider. Each purpose has its own timeout,
 * circuit breaker and configuration.
 */
export type AiPurpose = 'triage' | 'suggest' | 'summary' | 'embed' | 'copilot';

/** JSON schema for OpenAI-compatible chat completion response format. */
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

/** A successful result from an AI call, or an error. */
export type AiResult<T> = { readonly type: 'success'; readonly data: T } | { readonly type: 'error'; readonly error: AiError };

/** Call options for timeouts and execution context. */
export interface CallOptions {
  readonly timeoutMs: number;
}

/**
 * AiAdapter interface: provider-neutral methods for classification, priority scoring,
 * embeddings and text generation. All text input is RedactedText, verified before sending.
 *
 * Implementation is selected by the AI_PROVIDER config or env var: 'fake' or 'huggingface'.
 */
export interface AiAdapter {
  /**
   * Zero-shot classification: score text against a set of labels.
   * Returns scores (0–1) for each label, sorted by score descending.
   */
  classify(
    req: {
      readonly purpose: AiPurpose;
      readonly text: RedactedText;
      readonly labels: ReadonlyArray<{ readonly id: string; readonly description: string }>;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly scores: ReadonlyArray<{ readonly id: string; readonly confidence: number }> }>>;

  /**
   * Priority scoring: assign a ticket priority band and safety risk flag.
   * Bands are P0 (critical), P1 (high), P2 (normal), P3 (low).
   */
  scorePriority(
    req: { readonly text: RedactedText },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly band: 'P0' | 'P1' | 'P2' | 'P3'; readonly confidence: number; readonly safetyRisk: boolean }>>;

  /**
   * Feature extraction (embeddings): convert text to dense vectors for semantic search.
   * Returns one vector per input text, all of the same dimension.
   */
  embed(
    req: { readonly purpose: AiPurpose; readonly texts: ReadonlyArray<RedactedText> },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly vectors: ReadonlyArray<ReadonlyArray<number>>; readonly dimensions: number }>>;

  /**
   * Text generation: produce text output from a prompt, optionally constrained to a JSON schema.
   * Messages follow OpenAI format: role is 'user' or 'assistant', content is RedactedText.
   */
  generate(
    req: {
      readonly purpose: AiPurpose;
      readonly system: string;
      readonly messages: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: RedactedText }>;
      readonly responseSchema?: JsonSchema;
      readonly maxTokens: number;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly text: string }>>;
}

/** Sink for logging every call made through the adapter. Used by observability and ML quality. */
export interface AiCallLog {
  /**
   * Record a call: its inputs, outputs, latency and outcome.
   * Raw redacted text is never stored; only its SHA-256 hash is recorded.
   * @param call - Call details with hashed input, outputs, latencies and status
   */
  recordCall(call: AiCallRecord): Promise<void>;
}

/** A recorded AI call, with text hashed for privacy. */
export interface AiCallRecord {
  readonly purpose: AiPurpose;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  /** SHA-256 hash of the exact input text. */
  readonly inputHash: string;
  /** Raw output from the AI provider (before any post-processing). */
  readonly output: unknown;
  /** Extracted confidences, normalized to 0–1. */
  readonly confidences: ReadonlyArray<number>;
  /** Milliseconds spent in the provider call, excluding framework overhead. */
  readonly latencyMs: number;
  /** Status: 'success', 'timeout', 'error', 'breaker_open', etc. */
  readonly status: string;
  /** Error message if status is not 'success'. */
  readonly errorMessage?: string;
}

/** Configuration for a per-purpose call, including model and provider. */
export interface PurposeConfig {
  readonly modelId: string;
  readonly provider?: string;
  readonly timeoutMs: number;
}
