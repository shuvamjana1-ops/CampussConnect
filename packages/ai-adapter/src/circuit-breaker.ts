import Breaker from 'opossum';
import { LlmError } from './errors';
import type { AiAdapter, AiResult, CallOptions } from './types';

/**
 * Circuit breaker wrapper for an AiAdapter. Opens when the error rate exceeds a threshold
 * for a given period, rejecting requests immediately without calling the provider.
 *
 * Used per-purpose so failures in one (e.g. copilot) do not trip the breaker for others (e.g. triage).
 */
export class CircuitBreakerAdapter implements AiAdapter {
  private readonly breakers = new Map<string, Breaker<any>>();
  private readonly adapter: AiAdapter;

  constructor(adapter: AiAdapter, options?: CircuitBreakerOptions) {
    this.adapter = adapter;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private options: Required<CircuitBreakerOptions>;

  private getBreakerFor(purpose: string): Breaker<any> {
    let breaker = this.breakers.get(purpose);
    if (!breaker) {
      breaker = new Breaker(async (fn: () => Promise<unknown>) => fn(), {
        timeout: this.options.timeoutMs,
        errorThresholdPercentage: this.options.errorThresholdPercentage,
        resetTimeout: this.options.resetTimeoutMs,
        name: `ai-adapter-${purpose}`,
      });
      this.breakers.set(purpose, breaker);
    }
    return breaker;
  }

  async classify(
    req: {
      readonly purpose: string;
      readonly text: string;
      readonly labels: ReadonlyArray<{ readonly id: string; readonly description: string }>;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly scores: ReadonlyArray<{ readonly id: string; readonly confidence: number }> }>> {
    const breaker = this.getBreakerFor(req.purpose);
    try {
      const result = await breaker.fire(async () => this.adapter.classify(req, opts));
      return result;
    } catch (err) {
      if (breaker.opened) {
        return {
          type: 'error',
          error: new LlmError(`Circuit breaker open for ${req.purpose}`),
        };
      }
      throw err;
    }
  }

  async scorePriority(
    req: { readonly text: string },
    opts: CallOptions,
  ): Promise<
    AiResult<{ readonly band: 'P0' | 'P1' | 'P2' | 'P3'; readonly confidence: number; readonly safetyRisk: boolean }>
  > {
    const breaker = this.getBreakerFor('triage');
    try {
      const result = await breaker.fire(async () => this.adapter.scorePriority(req, opts));
      return result;
    } catch (err) {
      if (breaker.opened) {
        return {
          type: 'error',
          error: new LlmError('Circuit breaker open for triage'),
        };
      }
      throw err;
    }
  }

  async embed(
    req: { readonly purpose: string; readonly texts: ReadonlyArray<string> },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly vectors: ReadonlyArray<ReadonlyArray<number>>; readonly dimensions: number }>> {
    const breaker = this.getBreakerFor(req.purpose);
    try {
      const result = await breaker.fire(async () => this.adapter.embed(req, opts));
      return result;
    } catch (err) {
      if (breaker.opened) {
        return {
          type: 'error',
          error: new LlmError(`Circuit breaker open for ${req.purpose}`),
        };
      }
      throw err;
    }
  }

  async generate(
    req: {
      readonly purpose: string;
      readonly system: string;
      readonly messages: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: string }>;
      readonly responseSchema?: unknown;
      readonly maxTokens: number;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly text: string }>> {
    const breaker = this.getBreakerFor(req.purpose);
    try {
      const result = await breaker.fire(async () => this.adapter.generate(req, opts));
      return result;
    } catch (err) {
      if (breaker.opened) {
        return {
          type: 'error',
          error: new LlmError(`Circuit breaker open for ${req.purpose}`),
        };
      }
      throw err;
    }
  }

  /**
   * Get all breaker states for monitoring.
   */
  getBreakers(): ReadonlyArray<{ readonly purpose: string; readonly state: string }> {
    return Array.from(this.breakers.entries()).map(([purpose, breaker]) => ({
      purpose,
      state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    }));
  }
}

export interface CircuitBreakerOptions {
  /**
   * Error threshold percentage to trip the breaker. Default: 50%.
   */
  readonly errorThresholdPercentage?: number;

  /**
   * Timeout for a single operation (ms). Default: 30000.
   */
  readonly timeoutMs?: number;

  /**
   * Time (ms) before the breaker attempts to half-open. Default: 30000.
   */
  readonly resetTimeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  errorThresholdPercentage: 50,
  timeoutMs: 30000,
  resetTimeoutMs: 30000,
};
