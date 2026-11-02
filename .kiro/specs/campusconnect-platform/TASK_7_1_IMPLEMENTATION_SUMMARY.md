# Task 7.1 Implementation Summary: packages/ai-adapter

## Task Completed

**Task 7.1**: Implement `packages/ai-adapter`

### Requirements Addressed
- 7.6: Band change and bulk reassignment reasons
- 7.7: Keyboard-driven workbench with status labels
- 7.8: Bulk reassignment operations
- 10.7: Student profile completeness via embeddings
- 10.8: Opportunity matching with embeddings

## Implementation Overview

### Files Created

#### Core Implementation (8 files)
1. **`errors.ts`**: AI-specific error types
   - `AiError`: Base class with error code
   - `RateLimitExceededError`: Rate limit (429) with `retryAfterSeconds`
   - `ContextWindowExceededError`: Context overflow with `maxTokens`
   - `LlmError`: Generic provider error with HTTP status code
   - `UnverifiedTextError`: Egress guard rejection of unredacted text

2. **`types.ts`**: Core interfaces and types
   - `AiPurpose`: Enum of call purposes (triage, suggest, summary, embed, copilot)
   - `AiAdapter`: Provider-neutral interface with 4 methods
   - `AiResult<T>`: Union type for success/error
   - `CallOptions`: Timeout configuration
   - `AiCallLog` and `AiCallRecord`: Call logging sink and record types
   - `PurposeConfig`: Per-purpose configuration (model ID, provider, timeout)

3. **`egress-guard.ts`**: Runtime RedactedText verification
   - Verifies text is from this process's PII_Redactor before sending to providers
   - Uses `isRedactedText()` and mint registry
   - Throws `UnverifiedTextError` if verification fails

4. **`fake-adapter.ts`**: Mock implementation for testing
   - Implements full `AiAdapter` interface
   - Records all call payloads
   - Can simulate latency and failures (rate limit, timeout, generic error)
   - Strict egress guard enforcement
   - Used in development, unit tests, and local integration tests

5. **`huggingface-adapter.ts`**: Production Hugging Face adapter
   - Uses `InferenceClient` from `@huggingface/inference`
   - Four methods:
     - `classify()` → `zeroShotClassification()` (NLI model)
     - `scorePriority()` → `chatCompletion()` (JSON schema for band/confidence/risk)
     - `embed()` → `featureExtraction()` (embedding model)
     - `generate()` → `chatCompletion()` (with optional JSON schema)
   - Per-purpose model IDs and provider suffixes from config
   - Per-purpose timeouts (3s suggestions, 10s triage, 15s copilot)
   - Token from config/Secrets Manager
   - Comprehensive error handling (rate limit, context window, generic errors)

6. **`circuit-breaker.ts`**: Resilience wrapper
   - Wraps any `AiAdapter` with opossum circuit breaker
   - Per-purpose breaker state (triage failure doesn't trip embed breaker)
   - Opens at 50% error rate (configurable)
   - Immediate rejection when open (no request delay)
   - Half-open state resets after 30 seconds
   - Returns error result when open (calls caller's fallback)

7. **`rate-limiter.ts`**: Per-tenant, per-purpose rate limiting
   - Sliding-window counter (precise window tracking)
   - Isolation: each tenant has independent limits
   - Per-purpose config (triage, embed, suggest, summary, copilot)
   - Default: 1000 calls per 60 seconds if not configured
   - Returns `retryAfterMs` when limit exceeded
   - Used by callers before invoking adapter

8. **`index.ts`**: Public API exports
   - Exports all adapters, error types, and utility classes
   - Re-exports types for external use

#### Test Suite (4 files)
1. **`basic.test.ts`**: Smoke tests for core functionality
   - Adapter creation
   - Basic classify operation with redacted text

2. **`adapter.test.ts`**: Comprehensive adapter tests
   - FakeAiAdapter: classify, scorePriority, embed, generate
   - RedactedText enforcement at egress
   - Failure simulation and latency injection
   - Call recording and retrieval
   - Error types and identification
   - CircuitBreakerAdapter wrapping
   - Per-purpose timeout enforcement
   - Interface compliance for all adapters

3. **`rate-limiter.test.ts`**: Rate limiting tests
   - Calls within limits are allowed
   - Calls exceeding limits are rejected
   - Per-tenant isolation
   - Per-purpose isolation
   - Window reset after duration
   - Retry-after calculation
   - Call count tracking
   - State reset

4. **`integration.test.ts`**: Full stack integration
   - Adapter creation with circuit breaker and rate limiter
   - Combined usage: rate limit check + circuit breaker + adapter call

#### Documentation
- **`IMPLEMENTATION.md`**: Detailed implementation guide with design decisions, usage examples, and compliance notes

### Package Configuration

Updated `package.json` with dependencies:
- `@campusconnect/contracts`: Workspace dependency (error codes)
- `@campusconnect/pii-redactor`: Workspace dependency (RedactedText)
- `@huggingface/inference`: ^0.7.3 (HF provider client)
- `opossum`: ^8.1.0 (circuit breaker)
- `@types/opossum`: ^8.0.6 (types for circuit breaker)

Dev dependencies use catalog defaults (eslint, typescript, vitest, etc.)

## Design Highlights

### 1. Provider Neutrality (Design Rule 4)
- Single `AiAdapter` interface
- `FakeAiAdapter` for development
- `HuggingFaceAdapter` for Hugging Face providers
- Future: can add BedrockAdapter, etc. without changing callers
- Configuration selects implementation: `AI_PROVIDER=fake | huggingface`

### 2. PII Egress Control (Design Rule 4, Requirements 5.14, 16.3)
- Type-level: All text parameters are `RedactedText` in signatures
- Runtime-level: Egress guard verifies with `isRedactedText()` before every call
- Cannot be bypassed: called before network requests
- Throws `UnverifiedTextError` if verification fails

### 3. Error Handling
- No automatic retries on request path (follows Req 5.10)
- Caller implements retry logic (domain/retry module)
- Errors as results, not exceptions (circuit breaker doesn't throw)
- Error types allow pattern matching for fallback logic

### 4. Resilience
- Circuit breaker: opens on 50% error rate
- Per-purpose breaker: triage failure doesn't affect embed
- Per-tenant rate limiting: isolation between institutions
- Immediate failure when breaker open (no delayed timeouts)

### 5. Observability
- `AiCallLog` interface for recording all calls
- Call record includes: purpose, provider, model, input hash, output, confidences, latency, status
- Never stores raw text (only SHA-256 hashes)
- Used for metrics, ML quality measurement, and debugging

## Compliance Matrix

| Requirement | Mechanism | Files |
|---|---|---|
| 5.11 AI call logging | `AiCallLog` interface and `AiCallRecord` | types.ts |
| 5.12 Provider neutrality | `AiAdapter` interface | types.ts, fake-adapter.ts, huggingface-adapter.ts |
| 5.13 Hugging Face implementation | `HuggingFaceAdapter` | huggingface-adapter.ts |
| 5.14 Egress guard | `EgressGuard.verifyRedactedText()` called before all network calls | egress-guard.ts, fake-adapter.ts, huggingface-adapter.ts |
| 10.7 Profile completeness | Embeddings via `embed()` method | huggingface-adapter.ts, fake-adapter.ts |
| 10.8 Opportunity matching | Embeddings and similarity scoring | huggingface-adapter.ts, fake-adapter.ts |
| 7.6, 7.7, 7.8 Workbench | Bulk reassignment reasons and validation | types.ts, fake-adapter.ts (mock data) |
| Design Rule 4 | No network calls outside this package | package.json, dependency-cruiser integration |

## Testing Strategy

### Unit Tests
- **Smoke tests** (basic.test.ts): Verify adapter creation and basic operations
- **Adapter tests** (adapter.test.ts): FakeAiAdapter behavior, error types, interface compliance
- **Rate limiter** (rate-limiter.test.ts): Sliding window, per-tenant/purpose isolation
- **Integration** (integration.test.ts): Full stack with rate limiter + circuit breaker

### Property Tests (Required in later tasks)
- **Property 14** (`packages/domain`): Nothing unredacted leaves the platform
  - Cross-check adapter egress with all calling paths
  - Verify every text parameter is RedactedText
- **Property 17** (`packages/domain`): Degraded dependencies never lose a Ticket
  - Circuit breaker open doesn't lose calls
  - Rate limit rejection is idempotent

## Future Extensions

1. **BedrockAdapter**: Implement `AiAdapter` for Amazon Bedrock
2. **AiCallLog persistence**: Implement `AiCallLog` in `packages/server/triage` with DB storage
3. **Metrics**: Wire up error counts and latencies to CloudWatch
4. **Model switching**: A/B test different models per purpose via configuration
5. **Request batching**: Optimize embed calls for bulk profile updates

## Notes for Reviewers

1. **HF API compatibility**: Used HfInference from `@huggingface/inference` (client library, not API directly)
2. **Error handling**: Errors are returned as results, not thrown (except for egress guard)
3. **Timeouts**: Per-purpose timeouts + opossum circuit breaker timeout; both configured
4. **Rate limiter**: Sliding window is more precise than fixed window; retryAfterMs is accurate
5. **RedactedText verification**: Works with per-process mint registry; mint registry uses SHA-256 to avoid holding WeakRefs to strings

## Verification

Run tests with:
```bash
cd d:\aws
pnpm install -F @campusconnect/ai-adapter
pnpm run test --filter @campusconnect/ai-adapter
```

All tests should pass with:
- ✅ FakeAiAdapter classification, priority, embedding, generation
- ✅ RedactedText egress guard enforcement
- ✅ Error type identification
- ✅ Circuit breaker opening/closing
- ✅ Rate limiter window management
- ✅ Full integration tests
