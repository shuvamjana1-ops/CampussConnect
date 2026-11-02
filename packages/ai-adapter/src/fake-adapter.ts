import type { RedactedText } from '@campusconnect/pii-redactor';
import { LlmError, RateLimitExceededError } from './errors';
import { EgressGuard } from './egress-guard';
import type { AiAdapter, AiResult, CallOptions } from './types';

/**
 * Fake AI adapter for testing. Returns scripted outputs and can inject latency and failures.
 * Records every payload it receives for assertions in tests.
 */
export class FakeAiAdapter implements AiAdapter {
  private readonly calls: FakeCall[] = [];
  private failureMode: 'success' | 'timeout' | 'rate_limit' | 'error' = 'success';
  private latencyMs = 0;

  /**
   * Set a failure mode for the next N calls. If N is not given, the failure applies to all future calls.
   */
  setFailureMode(mode: 'success' | 'timeout' | 'rate_limit' | 'error', countOrUntilReset?: number): void {
    if (countOrUntilReset === 0 || countOrUntilReset === undefined) {
      this.failureMode = mode;
    }
    // For count-based failures: not implemented in this simple version
  }

  /**
   * Set artificial latency to simulate slow providers. Default 0.
   */
  setLatency(ms: number): void {
    this.latencyMs = Math.max(0, ms);
  }

  /**
   * Get all recorded calls for test assertions.
   */
  recordedCalls(): ReadonlyArray<FakeCall> {
    return [...this.calls];
  }

  /**
   * Clear recorded calls.
   */
  clearCalls(): void {
    this.calls.length = 0;
  }

  async classify(
    req: {
      readonly purpose: string;
      readonly text: RedactedText;
      readonly labels: ReadonlyArray<{ readonly id: string; readonly description: string }>;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly scores: ReadonlyArray<{ readonly id: string; readonly confidence: number }> }>> {
    EgressGuard.verifyRedactedText(req.text, 'FakeAiAdapter.classify');

    await this.simulateLatency(opts);
    if (this.failureMode !== 'success') {
      return this.simulateFailure();
    }

    this.calls.push({ method: 'classify', purpose: req.purpose, input: req.text, labels: req.labels });

    const scores = req.labels.map((label, idx) => ({
      id: label.id,
      confidence: 0.5 + (idx * 0.1) % 0.5, // Deterministic but varied scores
    }));

    return {
      type: 'success',
      data: { scores },
    };
  }

  async scorePriority(
    req: { readonly text: RedactedText },
    opts: CallOptions,
  ): Promise<
    AiResult<{ readonly band: 'P0' | 'P1' | 'P2' | 'P3'; readonly confidence: number; readonly safetyRisk: boolean }>
  > {
    EgressGuard.verifyRedactedText(req.text, 'FakeAiAdapter.scorePriority');

    await this.simulateLatency(opts);
    if (this.failureMode !== 'success') {
      return this.simulateFailure();
    }

    this.calls.push({ method: 'scorePriority', input: req.text });

    return {
      type: 'success',
      data: {
        band: 'P2',
        confidence: 0.75,
        safetyRisk: false,
      },
    };
  }

  async embed(
    req: { readonly purpose: string; readonly texts: ReadonlyArray<RedactedText> },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly vectors: ReadonlyArray<ReadonlyArray<number>>; readonly dimensions: number }>> {
    EgressGuard.verifyRequest(req.texts, 'FakeAiAdapter.embed');

    await this.simulateLatency(opts);
    if (this.failureMode !== 'success') {
      return this.simulateFailure();
    }

    this.calls.push({ method: 'embed', purpose: req.purpose, inputs: req.texts });

    // Return fixed-dimension embeddings (384 dims, typical for embedding models)
    const vectors = req.texts.map(() => Array.from({ length: 384 }, () => Math.random()));

    return {
      type: 'success',
      data: { vectors, dimensions: 384 },
    };
  }

  async generate(
    req: {
      readonly purpose: string;
      readonly system: string;
      readonly messages: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: RedactedText }>;
      readonly responseSchema?: unknown;
      readonly maxTokens: number;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly text: string }>> {
    for (const msg of req.messages) {
      EgressGuard.verifyRedactedText(msg.content, `FakeAiAdapter.generate message from ${msg.role}`);
    }

    await this.simulateLatency(opts);
    if (this.failureMode !== 'success') {
      return this.simulateFailure();
    }

    this.calls.push({
      method: 'generate',
      purpose: req.purpose,
      system: req.system,
      messages: req.messages,
    });

    return {
      type: 'success',
      data: { text: 'This is a fake AI-generated response.' },
    };
  }

  private async simulateLatency(opts: CallOptions): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Timeout: if simulated latency exceeds the call timeout, it times out
    if (this.latencyMs > opts.timeoutMs) {
      throw new Error(`Simulated timeout: ${this.latencyMs}ms > ${opts.timeoutMs}ms`);
    }
  }

  private simulateFailure(): AiResult<never> {
    if (this.failureMode === 'rate_limit') {
      const error = new RateLimitExceededError('Fake rate limit exceeded', 60);
      return { type: 'error', error };
    }
    if (this.failureMode === 'timeout') {
      const error = new LlmError('Fake timeout');
      return { type: 'error', error };
    }
    // error mode
    const error = new LlmError('Fake AI error', 500);
    return { type: 'error', error };
  }
}

export interface FakeCall {
  readonly method: string;
  readonly purpose?: string;
  readonly input?: RedactedText;
  readonly inputs?: ReadonlyArray<RedactedText>;
  readonly labels?: ReadonlyArray<{ readonly id: string; readonly description: string }>;
  readonly system?: string;
  readonly messages?: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: RedactedText }>;
}
