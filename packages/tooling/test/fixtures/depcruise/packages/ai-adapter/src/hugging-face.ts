// Allowed: packages/ai-adapter is the only place that calls an AI provider.
import { InferenceClient } from '@huggingface/inference';

export const client = InferenceClient;
