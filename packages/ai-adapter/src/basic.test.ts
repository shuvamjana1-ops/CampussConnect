import { describe, it, expect } from 'vitest';
import { FakeAiAdapter } from './index';
import { mintRedactedText } from '@campusconnect/pii-redactor';

describe('FakeAiAdapter basic functionality', () => {
  it('should create an adapter', () => {
    const adapter = new FakeAiAdapter();
    expect(adapter).toBeDefined();
  });

  it('should classify with redacted text', async () => {
    const adapter = new FakeAiAdapter();
    const text = mintRedactedText('[PII:NAME] is a student');
    const labels = [{ id: 'cat1', description: 'Academic' }];

    const result = await adapter.classify(
      { purpose: 'triage', text, labels },
      { timeoutMs: 5000 },
    );

    expect(result.type).toBe('success');
    if (result.type === 'success') {
      expect(result.data.scores).toHaveLength(1);
    }
  });
});
