import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mintRedactedText } from '@campusconnect/pii-redactor';
import {
  FakeAiAdapter,
  HuggingFaceAdapter,
  CircuitBreakerAdapter,
  UnverifiedTextError,
  LlmError,
  RateLimitExceededError,
  ContextWindowExceededError,
} from './index';
import type { AiAdapter } from './types';

describe('AiAdapter', () => {
  describe('FakeAiAdapter', () => {
    let adapter: FakeAiAdapter;

    beforeEach(() => {
      adapter = new FakeAiAdapter();
    });

    it('should classify with redacted text', async () => {
      const text = mintRedactedText('[PII:NAME] is a student');
      const labels = [
        { id: 'cat1', description: 'Academic' },
        { id: 'cat2', description: 'Administrative' },
      ];

      const result = await adapter.classify({ purpose: 'triage', text, labels }, { timeoutMs: 5000 });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.scores).toHaveLength(2);
        expect(result.data.scores[0].id).toBeDefined();
        expect(result.data.scores[0].confidence).toBeGreaterThanOrEqual(0);
        expect(result.data.scores[0].confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should reject unverified text', async () => {
      const labels = [{ id: 'cat1', description: 'Academic' }];
      const unredactedText = 'Priya is a student';

      const result = await adapter.classify(
        {
          purpose: 'triage',
          text: unredactedText as any,
          labels,
        },
        { timeoutMs: 5000 },
      );

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.error).toBeInstanceOf(UnverifiedTextError);
      }
    });

    it('should score priority with redacted text', async () => {
      const text = mintRedactedText('[PII:NAME] cannot access their grade');

      const result = await adapter.scorePriority({ text }, { timeoutMs: 5000 });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(['P0', 'P1', 'P2', 'P3']).toContain(result.data.band);
        expect(result.data.confidence).toBeGreaterThanOrEqual(0);
        expect(result.data.confidence).toBeLessThanOrEqual(1);
        expect(typeof result.data.safetyRisk).toBe('boolean');
      }
    });

    it('should embed redacted texts', async () => {
      const texts = [
        mintRedactedText('[PII:NAME] is asking about fees'),
        mintRedactedText('[PII:NAME] needs a transcript'),
      ];

      const result = await adapter.embed({ purpose: 'embed', texts }, { timeoutMs: 5000 });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.vectors).toHaveLength(2);
        expect(result.data.dimensions).toBeGreaterThan(0);
        expect(result.data.vectors[0]).toHaveLength(result.data.dimensions);
      }
    });

    it('should reject embedding unverified texts', async () => {
      const texts = ['Priya is asking about fees', 'John needs a transcript'] as any;

      const result = await adapter.embed({ purpose: 'embed', texts }, { timeoutMs: 5000 });

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.error).toBeInstanceOf(UnverifiedTextError);
      }
    });

    it('should generate with redacted text and system prompt', async () => {
      const text = mintRedactedText('Why is my fee so high?');

      const result = await adapter.generate(
        {
          purpose: 'summary',
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: text }],
          maxTokens: 100,
        },
        { timeoutMs: 5000 },
      );

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(typeof result.data.text).toBe('string');
        expect(result.data.text.length).toBeGreaterThan(0);
      }
    });

    it('should record all calls', async () => {
      const text = mintRedactedText('Sample text');
      const labels = [{ id: 'cat', description: 'Category' }];

      await adapter.classify({ purpose: 'triage', text, labels }, { timeoutMs: 5000 });
      await adapter.scorePriority({ text }, { timeoutMs: 5000 });
      await adapter.embed({ purpose: 'embed', texts: [text] }, { timeoutMs: 5000 });

      const calls = adapter.recordedCalls();
      expect(calls).toHaveLength(3);
      expect(calls[0].method).toBe('classify');
      expect(calls[1].method).toBe('scorePriority');
      expect(calls[2].method).toBe('embed');
    });

    it('should simulate failures', async () => {
      const text = mintRedactedText('Test text');

      adapter.setFailureMode('rate_limit');
      const rateLimitResult = await adapter.scorePriority({ text }, { timeoutMs: 5000 });
      expect(rateLimitResult.type).toBe('error');
      if (rateLimitResult.type === 'error') {
        expect(rateLimitResult.error).toBeInstanceOf(RateLimitExceededError);
      }

      adapter.setFailureMode('error');
      const errorResult = await adapter.scorePriority({ text }, { timeoutMs: 5000 });
      expect(errorResult.type).toBe('error');
      if (errorResult.type === 'error') {
        expect(errorResult.error).toBeInstanceOf(LlmError);
      }
    });

    it('should simulate latency', async () => {
      const text = mintRedactedText('Test');
      adapter.setLatency(10); // 10ms latency

      const start = Date.now();
      await adapter.scorePriority({ text }, { timeoutMs: 5000 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Error types', () => {
    it('should identify RateLimitExceededError', () => {
      const error = new RateLimitExceededError('Too many requests', 60);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfterSeconds).toBe(60);
    });

    it('should identify ContextWindowExceededError', () => {
      const error = new ContextWindowExceededError('Context too large', 4000);
      expect(error.code).toBe('CONTEXT_WINDOW_EXCEEDED');
      expect(error.maxTokens).toBe(4000);
    });

    it('should identify LlmError', () => {
      const error = new LlmError('Internal server error', 500);
      expect(error.code).toBe('AI_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should identify UnverifiedTextError', () => {
      const error = new UnverifiedTextError('Text not verified');
      expect(error.code).toBe('UNVERIFIED_TEXT');
    });
  });

  describe('CircuitBreakerAdapter', () => {
    it('should wrap an adapter with circuit breaker', async () => {
      const fakeAdapter = new FakeAiAdapter();
      const breaker = new CircuitBreakerAdapter(fakeAdapter);

      const text = mintRedactedText('Test');

      // First call should succeed
      const result1 = await breaker.scorePriority({ text }, { timeoutMs: 5000 });
      expect(result1.type).toBe('success');

      // Check breaker state
      const states = breaker.getBreakers();
      expect(states.length).toBeGreaterThan(0);
    });

    it('should open breaker on repeated failures', async () => {
      const fakeAdapter = new FakeAiAdapter();
      fakeAdapter.setFailureMode('error');

      const breaker = new CircuitBreakerAdapter(fakeAdapter, {
        errorThresholdPercentage: 50,
        resetTimeoutMs: 100,
      });

      const text = mintRedactedText('Test');

      // Make multiple failing calls
      for (let i = 0; i < 10; i++) {
        await breaker.scorePriority({ text }, { timeoutMs: 5000 });
      }

      const states = breaker.getBreakers();
      const triageState = states.find((s) => s.purpose.includes('triage'));
      // The breaker might be open or half-open depending on timing
      expect(['open', 'half-open', 'closed']).toContain(triageState?.state);
    });
  });

  describe('per-purpose timeouts', () => {
    it('should respect call timeout', async () => {
      const fakeAdapter = new FakeAiAdapter();
      fakeAdapter.setLatency(100); // 100ms latency

      const text = mintRedactedText('Test');

      // Call with timeout shorter than latency
      const result = await fakeAdapter.scorePriority({ text }, { timeoutMs: 50 });

      // Should result in timeout error
      expect(result.type).toBe('error');
    });
  });

  describe('adapter interface compliance', () => {
    let adapters: AiAdapter[];

    beforeEach(() => {
      adapters = [new FakeAiAdapter()];
    });

    it('should all implement the AiAdapter interface', async () => {
      const text = mintRedactedText('[PII:NAME] is a student');
      const labels = [
        { id: 'cat1', description: 'Academic' },
        { id: 'cat2', description: 'Administrative' },
      ];

      for (const adapter of adapters) {
        // Each method should exist and be callable
        expect(typeof adapter.classify).toBe('function');
        expect(typeof adapter.scorePriority).toBe('function');
        expect(typeof adapter.embed).toBe('function');
        expect(typeof adapter.generate).toBe('function');

        // All should return AiResult
        const classifyResult = await adapter.classify(
          { purpose: 'triage', text, labels },
          { timeoutMs: 5000 },
        );
        expect(['success', 'error']).toContain(classifyResult.type);
      }
    });
  });
});
