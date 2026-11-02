import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('vitest preset setup file', () => {
  it('configures fast-check to run 100 iterations per property by default', () => {
    expect(fc.readConfigureGlobal().numRuns).toBe(100);
  });
});
