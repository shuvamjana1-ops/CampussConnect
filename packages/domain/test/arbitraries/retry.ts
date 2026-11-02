// fast-check arbitraries for @campusconnect/domain/retry.

import * as fc from 'fast-check';
import { type RetryPolicy, exponentialWithJitter, fixedInterval } from '../../src/retry/index.js';

/**
 * Arbitrary for retry policies (both fixed and exponential).
 */
export function retryPolicies(): fc.Arbitrary<RetryPolicy> {
  const fixedPolicies = fc
    .tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 100, max: 600000 }))
    .map(([maxRetries, delayMs]) => fixedInterval(maxRetries, delayMs, 'flag'));

  const exponentialPolicies = fc
    .tuple(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 100, max: 60000 }),
      fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 1, max: 100 })).map(([a, b]) => Math.min(a, b - 1) / 100),
    )
    .map(([maxRetries, baseDelayMs, jitterRatio]) =>
      exponentialWithJitter(maxRetries, baseDelayMs, jitterRatio, 'dead-letter'),
    );

  return fc.oneof(fixedPolicies, exponentialPolicies);
}

export {};
