# AI Adapter Implementation (Task 7.1)

## Overview

This package implements `@campusconnect/ai-adapter`, the provider-neutral interface for AI calls in CampusConnect. It ensures all text sent to AI providers is redacted, rate-limited per tenant, and logged for observability.

## Requirements Addressed

- **7.6**: Bulk reassignment reasons
- **7.7**: Keyboard-driven workbench
- **7.8**: Bulk reassignment
- **10.7**: Profile completeness
- **10.8**: Opportunity matching (via embeddings)
- **5.11-5.14**: PII redaction, provider neutrality, Hugging Face implementation, egress guard

## Components

### 1. Error Types (`errors.ts`)

- `AiError`: Base class for all AI adapter errors
- `RateLimitExceededError`: Provider rejected due to rate limiting (429)
- `ContextWindowExceededError`: Input exceeded model's context window
- `LlmError`: Generic LLM provider error
- `UnverifiedTextError`: Egress guard rejected unredacted text

All errors have a `code` field for logging and metrics classification.

### 2. Core Types (`types.ts`)

- `AiPurpose`: Enum of call purposes (triage, suggest, summary, embed, copilot)
- `AiAdapter`: Provider-neutral interface with methods:
  - `classify()`: Zero-shot classification
  - `scorePriority()`: Priority band and safety scoring
  - `embed()`: Feature extraction for semantic search
  - `generate()`: Text generation with optional JSON schema
- `AiResult<T>`: Result union (success or error)
- `CallOptions`: Timeout configuration per call
- `AiCallLog`: Sink for call recording
- `AiCallRecord`: Logged data (never includes raw text, only hashes)

### 3. Egress Guard (`egress-guard.ts`)

Runtime safety check that verifies text is `RedactedText` from the PII redactor before sending to AI providers. Uses the per-process mint registry to validate that text was produced by this process's redactor.

**Key property**: Prevents accidental exposure of unredacted PII to external providers.

### 4. FakeAiAdapter (`fake-adapter.ts`)

Mock adapter for testing. Features:
- Returns scripted outputs
- Records every call payload
- Simulates latency and failures (rate limit, timeout, generic error)
- Strict redacted-text enforcement (same egress guard as real adapter)

Used in development and unit tests for deterministic behavior.

### 5. HuggingFaceAdapter (`huggingface-adapter.ts`)

Production adapter using Hugging Face Inference Providers. Features:
- Uses `InferenceClient` from `@huggingface/inference`
- Methods:
  - `classify()` → `zeroShotClassification()` with NLI model
  - `scorePriority()` → `chatCompletion()` with JSON schema
  - `embed()` → `featureExtraction()` with embedding model
  - `generate()` → `chatCompletion()` with optional JSON schema
- Per-purpose model IDs and provider suffixes (from config)
- Per-purpose timeouts (3s suggestions, 10s triage, 15s copilot)
- Token read from config/Secrets Manager
- Egress guard enforces RedactedText

### 6. Circuit Breaker (`circuit-breaker.ts`)

Wraps any adapter to add resilience:
- Opens on 50% error rate (configurable)
- Per-purpose breaker state (triage failure doesn't block embed calls)
- Immediate rejection when open (no fallback delay)
- Half-open state attempts reset after 30 seconds

**Design**: Caller's fallback logic (e.g., keyword routing) handles breaker open.

### 7. Per-Tenant Rate Limiter (`rate-limiter.ts`)

Sliding-window counter for rate limits per tenant and purpose:
- Isolation: each tenant has independent limits
- Per-purpose config: triage, embed, suggest, summary, copilot can have different rates
- Default: 1000 calls per 60 seconds if not configured
- Returns `retryAfterMs` when limit exceeded

Used by callers to reject requests before invoking the adapter.

## Design Decisions

1. **RedactedText verification at two levels**:
   - Type level: Methods accept only `RedactedText` in signatures
   - Runtime level: Egress guard verifies with `isRedactedText()` before network calls

2. **No automatic retries**:
   - Circuit breaker and timeouts are built-in
   - Caller implements retry logic (domain/retry)
   - Follows separation of concerns: adapter handles delivery, caller handles recovery

3. **Per-purpose configuration**:
   - Model IDs, provider suffixes, and timeouts vary by purpose
   - Allows flexibility: cheap, fast models for suggestions vs. larger models for copilot

4. **Error as result, not exception**:
   - All methods return `AiResult<T>` (success or error)
   - Circuit breaker opens immediately without rethrowing
   - Callers can pattern-match on error type for fallback logic

## Testing

### Unit Tests

- `basic.test.ts`: Smoke tests for adapter creation and classify
- `adapter.test.ts`: Comprehensive FakeAiAdapter tests
- `rate-limiter.test.ts`: Rate limiting logic

### Property Tests

Not included in this task but required in later tasks:
- **Property 14**: Nothing unredacted leaves the platform (across all purposes)
- **Property 17**: Degraded dependencies never lose a Ticket

## Usage

```typescript
// Create a fake adapter for testing
const adapter = new FakeAiAdapter();
const text = mintRedactedText('[PII:NAME] is a student');

// Call a method with timeout
const result = await adapter.classify(
  { purpose: 'triage', text, labels: [...] },
  { timeoutMs: 10_000 }
);

// Handle result
if (result.type === 'success') {
  // Use result.data.scores
} else {
  // Handle result.error (RateLimitExceededError, etc.)
}
```

## Compliance

- **Design rule 4**: Only this package may call AI providers
- **Design rule 4**: Only pii-redactor may mint RedactedText
- **Requirement 5.14**: Egress guard prevents unredacted text from leaving
- **Requirement 5.11**: Call log records metadata (purpose, model, hash, latency, status) never raw text
- **Requirement 5.12-5.14**: Provider neutrality, HF implementation, egress guard, resilience
