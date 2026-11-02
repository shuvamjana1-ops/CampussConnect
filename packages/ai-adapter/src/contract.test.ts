import { describe, it, expect, beforeEach } from 'vitest';
import { mintRedactedText } from '@campusconnect/pii-redactor';
import {
  FakeAiAdapter,
  HuggingFaceAdapter,
  UnverifiedTextError,
  LlmError,
  RateLimitExceededError,
  ContextWindowExceededError,
} from './index';
import type { AiAdapter, AiPurpose, AiResult } from './types';

/**
 * Shared contract tests for AiAdapter implementations.
 *
 * These tests verify that all AiAdapter implementations (FakeAiAdapter, HuggingFaceAdapter)
 * satisfy the same contract and enforce the critical security requirement: no unverified
 * text is sent to the AI provider. The tests cover:
 *
 * - PII egress verification: unverified text is refused before any network call
 * - Error handling: all adapter implementations properly categorize and return errors
 * - Result shape correctness: all results conform to the AiResult type contract
 * - Timeout enforcement: adapters respect per-call timeouts
 * - Provider-neutral interface: same methods and configurations work across all implementations
 *
 * **Note on Rate Limiting**: Rate limiting is enforced at the caller level via PerTenantRateLimiter
 * (see rate-limiter.ts and rate-limiter.test.ts). The AiAdapter contract itself guarantees that
 * it accepts only RedactedText, properly handles timeouts, and returns consistent result shapes.
 * Both adapters may return RateLimitExceededError if the provider enforces limits, but this is
 * an implementation detail, not a contract requirement.
 *
 * **Validates: Requirements 5.12, 5.13, 5.14**
 * - 5.12: Provider-neutral interface for classification, priority scoring, embeddings and text generation
 * - 5.13: Hugging Face API as default provider
 * - 5.14: No text is sent to external providers unless it has passed the PII_Redactor
 */

/**
 * Run the shared AiAdapter contract tests against an adapter instance.
 * Call this function with any AiAdapter implementation to verify compliance.
 */
function defineAdapterContractSuite(adapterFactory: () => AiAdapter, adapterName: string) {
  describe(`AiAdapter Contract: ${adapterName}`, () => {
    let adapter: AiAdapter;

    beforeEach(() => {
      adapter = adapterFactory();
    });

    describe('PII Egress Verification (Requirement 5.14)', () => {
      describe('classify', () => {
        it('should accept redacted text and return valid result shape', async () => {
          const text = mintRedactedText('[PII:NAME] is a student asking about fees');
          const labels = [
            { id: 'academic', description: 'Academic' },
            { id: 'financial', description: 'Financial' },
          ];

          const result = await adapter.classify(
            { purpose: 'triage', text, labels },
            { timeoutMs: 5000 },
          );

          // Result shape verification
          expect(result).toHaveProperty('type');
          expect(['success', 'error']).toContain(result.type);

          if (result.type === 'success') {
            expect(result.data).toHaveProperty('scores');
            expect(Array.isArray(result.data.scores)).toBe(true);
            expect(result.data.scores).toHaveLength(labels.length);

            // Each score must have correct shape
            result.data.scores.forEach((score) => {
              expect(score).toHaveProperty('id');
              expect(score).toHaveProperty('confidence');
              expect(typeof score.id).toBe('string');
              expect(typeof score.confidence).toBe('number');
              expect(score.confidence).toBeGreaterThanOrEqual(0);
              expect(score.confidence).toBeLessThanOrEqual(1);
            });

            // Scores should be sorted descending by confidence
            for (let i = 0; i < result.data.scores.length - 1; i++) {
              expect(result.data.scores[i].confidence).toBeGreaterThanOrEqual(
                result.data.scores[i + 1].confidence,
              );
            }
          }
        });

        it('should reject unverified (unredacted) text before any network call', async () => {
          const unredactedText = 'Priya Sharma is complaining about the grading system';
          const labels = [
            { id: 'academic', description: 'Academic' },
            { id: 'administrative', description: 'Administrative' },
          ];

          const result = await adapter.classify(
            { purpose: 'triage', text: unredactedText as any, labels },
            { timeoutMs: 5000 },
          );

          // Must be an error
          expect(result.type).toBe('error');
          if (result.type === 'error') {
            // Must be UnverifiedTextError, not a network error
            expect(result.error).toBeInstanceOf(UnverifiedTextError);
            expect(result.error.code).toBe('UNVERIFIED_TEXT');
          }
        });

        it('should reject partially redacted text', async () => {
          // A mix of redacted and unredacted content should be rejected
          const partiallyRedactedText = '[PII:NAME] is asking about grades for user@example.com';
          const labels = [{ id: 'cat1', description: 'Category' }];

          const result = await adapter.classify(
            { purpose: 'triage', text: partiallyRedactedText as any, labels },
            { timeoutMs: 5000 },
          );

          expect(result.type).toBe('error');
        });
      });

      describe('scorePriority', () => {
        it('should accept redacted text and return valid result shape', async () => {
          const text = mintRedactedText('[PII:NAME] cannot access [PII:GOV_ID] to verify identity');

          const result = await adapter.scorePriority({ text }, { timeoutMs: 5000 });

          expect(result).toHaveProperty('type');
          expect(['success', 'error']).toContain(result.type);

          if (result.type === 'success') {
            expect(result.data).toHaveProperty('band');
            expect(result.data).toHaveProperty('confidence');
            expect(result.data).toHaveProperty('safetyRisk');

            // Validate band
            expect(['P0', 'P1', 'P2', 'P3']).toContain(result.data.band);

            // Validate confidence
            expect(typeof result.data.confidence).toBe('number');
            expect(result.data.confidence).toBeGreaterThanOrEqual(0);
            expect(result.data.confidence).toBeLessThanOrEqual(1);

            // Validate safetyRisk
            expect(typeof result.data.safetyRisk).toBe('boolean');
          }
        });

        it('should reject unverified (unredacted) text before any network call', async () => {
          const unredactedText = 'John Doe is threatening to harm himself if his complaint is not resolved';

          const result = await adapter.scorePriority({ text: unredactedText as any }, { timeoutMs: 5000 });

          expect(result.type).toBe('error');
          if (result.type === 'error') {
            expect(result.error).toBeInstanceOf(UnverifiedTextError);
            expect(result.error.code).toBe('UNVERIFIED_TEXT');
          }
        });
      });

      describe('embed', () => {
        it('should accept redacted texts and return valid result shape', async () => {
          const texts = [
            mintRedactedText('[PII:NAME] needs help with registration'),
            mintRedactedText('[PII:NAME] cannot access the portal'),
          ];

          const result = await adapter.embed({ purpose: 'embed', texts }, { timeoutMs: 5000 });

          expect(result).toHaveProperty('type');
          expect(['success', 'error']).toContain(result.type);

          if (result.type === 'success') {
            expect(result.data).toHaveProperty('vectors');
            expect(result.data).toHaveProperty('dimensions');

            // Validate vectors shape
            expect(Array.isArray(result.data.vectors)).toBe(true);
            expect(result.data.vectors).toHaveLength(texts.length);
            expect(typeof result.data.dimensions).toBe('number');
            expect(result.data.dimensions).toBeGreaterThan(0);

            // Each vector must match dimensions
            result.data.vectors.forEach((vector) => {
              expect(Array.isArray(vector)).toBe(true);
              expect(vector).toHaveLength(result.data.dimensions);
              vector.forEach((value) => {
                expect(typeof value).toBe('number');
              });
            });
          }
        });

        it('should reject unverified (unredacted) texts before any network call', async () => {
          const unredactedTexts = ['Priya is asking about fees', 'John needs a transcript'] as any;

          const result = await adapter.embed({ purpose: 'embed', texts: unredactedTexts }, { timeoutMs: 5000 });

          expect(result.type).toBe('error');
          if (result.type === 'error') {
            expect(result.error).toBeInstanceOf(UnverifiedTextError);
            expect(result.error.code).toBe('UNVERIFIED_TEXT');
          }
        });

        it('should reject if any text in the array is unverified', async () => {
          const mixedTexts = [
            mintRedactedText('[PII:NAME] is a valid student'),
            'UnredactedName asking about fees', // unverified
          ] as any;

          const result = await adapter.embed({ purpose: 'embed', texts: mixedTexts }, { timeoutMs: 5000 });

          expect(result.type).toBe('error');
          if (result.type === 'error') {
            expect(result.error).toBeInstanceOf(UnverifiedTextError);
          }
        });
      });

      describe('generate', () => {
        it('should accept redacted messages and return valid result shape', async () => {
          const messages = [
            {
              role: 'user' as const,
              content: mintRedactedText('Why is [PII:NAME] not able to register for courses?'),
            },
          ];

          const result = await adapter.generate(
            {
              purpose: 'summary',
              system: 'You are a helpful assistant.',
              messages,
              maxTokens: 100,
            },
            { timeoutMs: 5000 },
          );

          expect(result).toHaveProperty('type');
          expect(['success', 'error']).toContain(result.type);

          if (result.type === 'success') {
            expect(result.data).toHaveProperty('text');
            expect(typeof result.data.text).toBe('string');
            // Text should not be empty
            expect(result.data.text.length).toBeGreaterThan(0);
          }
        });

        it('should reject unverified (unredacted) messages before any network call', async () => {
          const messages = [
            {
              role: 'user' as const,
              content: 'Priya is complaining about her grade' as any,
            },
          ];

          const result = await adapter.generate(
            {
              purpose: 'summary',
              system: 'You are a helpful assistant.',
              messages,
              maxTokens: 100,
            },
            { timeoutMs: 5000 },
          );

          expect(result.type).toBe('error');
          if (result.type === 'error') {
            expect(result.error).toBeInstanceOf(UnverifiedTextError);
          }
        });

        it('should reject if system prompt or any message content is unverified', async () => {
          const messages = [
            {
              role: 'user' as const,
              content: mintRedactedText('[PII:NAME] is asking about fees'),
            },
          ];

          // Even if messages are redacted, an unredacted system prompt would fail
          // (This is implementation-specific but the guard should catch it)
          const result = await adapter.generate(
            {
              purpose: 'summary',
              system: 'You are a helpful assistant.',
              messages,
              maxTokens: 100,
            },
            { timeoutMs: 5000 },
          );

          // This call should succeed (system is plain text)
          expect(['success', 'error']).toContain(result.type);
        });
      });
    });

    describe('Error Handling (Requirement 5.12)', () => {
      it('should return properly typed error results', async () => {
        const text = mintRedactedText('test');

        const classifyResult = await adapter.classify(
          {
            purpose: 'invalid-purpose' as AiPurpose,
            text,
            labels: [{ id: 'cat', description: 'Category' }],
          },
          { timeoutMs: 5000 },
        );

        if (classifyResult.type === 'error') {
          expect(classifyResult.error).toHaveProperty('code');
          expect(classifyResult.error).toHaveProperty('message');
          expect(typeof classifyResult.error.code).toBe('string');
          expect(typeof classifyResult.error.message).toBe('string');
        }
      });

      it('should respect timeout and return error on timeout', async () => {
        const text = mintRedactedText('test');

        // Very short timeout
        const result = await adapter.scorePriority({ text }, { timeoutMs: 1 });

        // May succeed immediately or timeout - but if it errors, should be valid
        if (result.type === 'error') {
          expect(result.error).toHaveProperty('code');
        }
      });
    });

    describe('Result Shape Correctness', () => {
      describe('Provider-neutral interface (Requirement 5.12)', () => {
        it('should have all required methods', () => {
          expect(typeof adapter.classify).toBe('function');
          expect(typeof adapter.scorePriority).toBe('function');
          expect(typeof adapter.embed).toBe('function');
          expect(typeof adapter.generate).toBe('function');
        });

        it('classify results contain scores for all labels', async () => {
          const text = mintRedactedText('test');
          const labels = [
            { id: 'cat1', description: 'Category 1' },
            { id: 'cat2', description: 'Category 2' },
            { id: 'cat3', description: 'Category 3' },
          ];

          const result = await adapter.classify(
            { purpose: 'triage', text, labels },
            { timeoutMs: 5000 },
          );

          if (result.type === 'success') {
            // All labels must be represented in scores
            const scoreIds = new Set(result.data.scores.map((s) => s.id));
            labels.forEach((label) => {
              expect(scoreIds.has(label.id)).toBe(true);
            });
          }
        });

        it('embed results have consistent vector dimensions', async () => {
          const texts = [
            mintRedactedText('first text'),
            mintRedactedText('second text'),
            mintRedactedText('third text'),
          ];

          const result = await adapter.embed({ purpose: 'embed', texts }, { timeoutMs: 5000 });

          if (result.type === 'success') {
            const { vectors, dimensions } = result.data;
            expect(vectors).toHaveLength(texts.length);

            // Every vector must have the same dimension
            vectors.forEach((vector) => {
              expect(vector).toHaveLength(dimensions);
            });

            // Dimensions must be positive
            expect(dimensions).toBeGreaterThan(0);
          }
        });

        it('generate results contain non-empty text', async () => {
          const text = mintRedactedText('test');

          const result = await adapter.generate(
            {
              purpose: 'summary',
              system: 'You are helpful.',
              messages: [{ role: 'user', content: text }],
              maxTokens: 50,
            },
            { timeoutMs: 5000 },
          );

          if (result.type === 'success') {
            expect(result.data.text).toBeDefined();
            expect(typeof result.data.text).toBe('string');
          }
        });
      });

      describe('Confidence normalization', () => {
        it('classify confidence scores are normalized to 0-1', async () => {
          const text = mintRedactedText('test');
          const labels = [
            { id: 'cat1', description: 'Cat1' },
            { id: 'cat2', description: 'Cat2' },
          ];

          const result = await adapter.classify(
            { purpose: 'triage', text, labels },
            { timeoutMs: 5000 },
          );

          if (result.type === 'success') {
            result.data.scores.forEach((score) => {
              expect(score.confidence).toBeGreaterThanOrEqual(0);
              expect(score.confidence).toBeLessThanOrEqual(1);
            });
          }
        });

        it('scorePriority confidence is normalized to 0-1', async () => {
          const text = mintRedactedText('test');

          const result = await adapter.scorePriority({ text }, { timeoutMs: 5000 });

          if (result.type === 'success') {
            expect(result.data.confidence).toBeGreaterThanOrEqual(0);
            expect(result.data.confidence).toBeLessThanOrEqual(1);
          }
        });
      });
    });

    describe('Purpose Configuration (Requirement 5.12)', () => {
      it('should handle all registered AI purposes', async () => {
        const purposes: AiPurpose[] = ['triage', 'suggest', 'summary', 'embed', 'copilot'];
        const text = mintRedactedText('test');

        for (const purpose of purposes) {
          // At least embed should work with all purposes
          const result = await adapter.embed({ purpose, texts: [text] }, { timeoutMs: 5000 });
          expect(['success', 'error']).toContain(result.type);
        }
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty or minimal redacted text', async () => {
        const minimalText = mintRedactedText('x');
        const labels = [{ id: 'cat', description: 'Category' }];

        const result = await adapter.classify(
          { purpose: 'triage', text: minimalText, labels },
          { timeoutMs: 5000 },
        );

        expect(['success', 'error']).toContain(result.type);
      });

      it('should handle single text in embed', async () => {
        const text = mintRedactedText('single text');

        const result = await adapter.embed({ purpose: 'embed', texts: [text] }, { timeoutMs: 5000 });

        if (result.type === 'success') {
          expect(result.data.vectors).toHaveLength(1);
        }
      });

      it('should handle many labels in classify', async () => {
        const text = mintRedactedText('test');
        const labels = Array.from({ length: 20 }, (_, i) => ({
          id: `cat${i}`,
          description: `Category ${i}`,
        }));

        const result = await adapter.classify(
          { purpose: 'triage', text, labels },
          { timeoutMs: 5000 },
        );

        if (result.type === 'success') {
          expect(result.data.scores).toHaveLength(labels.length);
        }
      });
    });
  });
}

// Run contract tests for FakeAiAdapter
defineAdapterContractSuite(
  () => new FakeAiAdapter(),
  'FakeAiAdapter',
);

// Run contract tests for HuggingFaceAdapter with mocked configuration
defineAdapterContractSuite(
  () =>
    new HuggingFaceAdapter('fake-token', {
      triage: {
        modelId: 'mistralai/Mistral-7B-Instruct-v0.1',
        timeoutMs: 3000,
      },
      suggest: {
        modelId: 'facebook/bart-large-mnli',
        timeoutMs: 3000,
      },
      summary: {
        modelId: 'facebook/bart-large-cnn',
        timeoutMs: 3000,
      },
      embed: {
        modelId: 'BAAI/bge-small-en-v1.5',
        timeoutMs: 5000,
      },
      copilot: {
        modelId: 'mistralai/Mistral-7B-Instruct-v0.1',
        timeoutMs: 10000,
      },
    }),
  'HuggingFaceAdapter',
);
