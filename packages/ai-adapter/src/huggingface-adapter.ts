import { HfInference } from '@huggingface/inference';
import type { RedactedText } from '@campusconnect/pii-redactor';
import { ContextWindowExceededError, LlmError, RateLimitExceededError } from './errors';
import { EgressGuard } from './egress-guard';
import type { AiAdapter, AiResult, CallOptions, PurposeConfig } from './types';

/**
 * Hugging Face Inference adapter. Uses InferenceClient from @huggingface/inference to call
 * the HF Inference Providers router or a dedicated endpoint.
 *
 * Configuration: model ids and optional provider suffix are specified per purpose and read from
 * config or Secrets Manager. The HF token must be provided via constructor.
 */
export class HuggingFaceAdapter implements AiAdapter {
  private readonly client: HfInference;
  private readonly config: Map<string, PurposeConfig>;

  /**
   * Create a new HuggingFace adapter with a token and per-purpose configuration.
   * @param token - Hugging Face API token
   * @param config - Configuration by purpose: modelId, optional provider suffix, and timeoutMs
   */
  constructor(token: string, config: Record<string, PurposeConfig>) {
    this.client = new HfInference(token);
    this.config = new Map(Object.entries(config));
  }

  private getConfig(purpose: string): PurposeConfig {
    const cfg = this.config.get(purpose);
    if (!cfg) {
      throw new LlmError(`No configuration found for AI purpose '${purpose}'`);
    }
    return cfg;
  }

  private modelIdWithProvider(modelId: string, purpose: string, provider?: string): string {
    // Append provider suffix if provided, e.g. 'BAAI/bge-m3:cheapest'
    if (provider) {
      return `${modelId}:${provider}`;
    }
    return modelId;
  }

  async classify(
    req: {
      readonly purpose: string;
      readonly text: RedactedText;
      readonly labels: ReadonlyArray<{ readonly id: string; readonly description: string }>;
    },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly scores: ReadonlyArray<{ readonly id: string; readonly confidence: number }> }>> {
    EgressGuard.verifyRedactedText(req.text, 'HuggingFaceAdapter.classify');

    try {
      const cfg = this.getConfig(req.purpose);
      const modelId = this.modelIdWithProvider(cfg.modelId, req.purpose, cfg.provider);

      // Use shorter timeout from config or call options
      const effectiveTimeout = Math.min(cfg.timeoutMs, opts.timeoutMs);

      // zeroShotClassification: returns { labels, scores }
      const result = await Promise.race([
        this.client.zeroShotClassification({
          model: modelId,
          inputs: req.text,
          candidateLabels: req.labels.map((l) => l.description),
          multiLabel: false,
        }),
        this.createTimeoutPromise(effectiveTimeout),
      ]);

      if (Array.isArray(result)) {
        // Single input returns an array of classification results
        const classification = result[0];
        if (!classification || !classification.scores || !classification.labels) {
          throw new LlmError('Invalid response structure from zeroShotClassification');
        }

        // Match scores back to label ids in descending order
        const scores = req.labels
          .map((label, idx) => {
            const scoreIdx = classification.labels.indexOf(label.description);
            const confidence = scoreIdx >= 0 ? classification.scores[scoreIdx] : 0;
            return { id: label.id, confidence };
          })
          .sort((a, b) => b.confidence - a.confidence);

        return { type: 'success', data: { scores } };
      }

      throw new LlmError('Unexpected response type from zeroShotClassification');
    } catch (err) {
      return this.handleError(err);
    }
  }

  async scorePriority(
    req: { readonly text: RedactedText },
    opts: CallOptions,
  ): Promise<
    AiResult<{ readonly band: 'P0' | 'P1' | 'P2' | 'P3'; readonly confidence: number; readonly safetyRisk: boolean }>
  > {
    EgressGuard.verifyRedactedText(req.text, 'HuggingFaceAdapter.scorePriority');

    try {
      const cfg = this.getConfig('triage');
      const modelId = this.modelIdWithProvider(cfg.modelId, 'triage', cfg.provider);
      const effectiveTimeout = Math.min(cfg.timeoutMs, opts.timeoutMs);

      // chatCompletion with JSON schema to extract band, confidence and safetyRisk
      const schema = {
        type: 'object',
        properties: {
          band: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          safetyRisk: { type: 'boolean' },
        },
        required: ['band', 'confidence', 'safetyRisk'],
      };

      const result = await Promise.race([
        this.client.chatCompletion({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: req.text,
            },
          ],
          temperature: 0.1, // Low temperature for consistency
          max_tokens: 100,
          response_format: { type: 'json_object', schema },
        }),
        this.createTimeoutPromise(effectiveTimeout),
      ]);

      if (!result.choices || result.choices.length === 0) {
        throw new LlmError('No choices returned from chatCompletion');
      }

      const content = result.choices[0].message?.content;
      if (!content) {
        throw new LlmError('No content in chatCompletion response');
      }

      const parsed = JSON.parse(content);
      if (!parsed.band || typeof parsed.confidence !== 'number' || typeof parsed.safetyRisk !== 'boolean') {
        throw new LlmError('Invalid schema in chatCompletion response');
      }

      return {
        type: 'success',
        data: {
          band: parsed.band,
          confidence: Math.max(0, Math.min(1, parsed.confidence)),
          safetyRisk: parsed.safetyRisk,
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async embed(
    req: { readonly purpose: string; readonly texts: ReadonlyArray<RedactedText> },
    opts: CallOptions,
  ): Promise<AiResult<{ readonly vectors: ReadonlyArray<ReadonlyArray<number>>; readonly dimensions: number }>> {
    EgressGuard.verifyRequest(req.texts, 'HuggingFaceAdapter.embed');

    try {
      const cfg = this.getConfig(req.purpose);
      const modelId = this.modelIdWithProvider(cfg.modelId, req.purpose, cfg.provider);
      const effectiveTimeout = Math.min(cfg.timeoutMs, opts.timeoutMs);

      // featureExtraction returns embeddings for each text
      const result = await Promise.race([
        this.client.featureExtraction({
          model: modelId,
          inputs: req.texts as string[],
        }),
        this.createTimeoutPromise(effectiveTimeout),
      ]);

      if (!Array.isArray(result)) {
        throw new LlmError('featureExtraction did not return an array');
      }

      const vectors = result as ReadonlyArray<ReadonlyArray<number>>;
      const dimensions = vectors[0]?.length || 0;

      return {
        type: 'success',
        data: { vectors, dimensions },
      };
    } catch (err) {
      return this.handleError(err);
    }
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
      EgressGuard.verifyRedactedText(msg.content, `HuggingFaceAdapter.generate message from ${msg.role}`);
    }

    try {
      const cfg = this.getConfig(req.purpose);
      const modelId = this.modelIdWithProvider(cfg.modelId, req.purpose, cfg.provider);
      const effectiveTimeout = Math.min(cfg.timeoutMs, opts.timeoutMs);

      // Build messages with system role
      const messages = [
        { role: 'system' as const, content: req.system },
        ...req.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const result = await Promise.race([
        this.client.chatCompletion({
          model: modelId,
          messages,
          temperature: 0.7,
          max_tokens: Math.min(req.maxTokens, 4000),
          response_format: req.responseSchema ? { type: 'json_object', schema: req.responseSchema } : undefined,
        }),
        this.createTimeoutPromise(effectiveTimeout),
      ]);

      if (!result.choices || result.choices.length === 0) {
        throw new LlmError('No choices returned from chatCompletion');
      }

      const content = result.choices[0].message?.content;
      if (!content) {
        throw new LlmError('No content in chatCompletion response');
      }

      return {
        type: 'success',
        data: { text: content },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  private handleError(err: unknown): AiResult<never> {
    if (err instanceof Error && err.message.includes('timeout')) {
      return { type: 'error', error: new LlmError('Request timed out') };
    }

    if (err instanceof Error) {
      const message = err.message;

      // Check for rate limiting
      if (message.includes('429') || message.includes('rate')) {
        return { type: 'error', error: new RateLimitExceededError('Rate limit exceeded', 60) };
      }

      // Check for context window errors
      if (message.includes('context') || message.includes('token')) {
        return { type: 'error', error: new ContextWindowExceededError('Context window exceeded') };
      }

      // Generic HTTP error with status code extraction attempt
      const statusMatch = message.match(/(\d{3})/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

      return { type: 'error', error: new LlmError(message, status) };
    }

    return { type: 'error', error: new LlmError('Unknown error from HuggingFace provider') };
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
}
