// fast-check arbitraries for @campusconnect/domain/auth.

import * as fc from 'fast-check';
import { type AttemptRecord } from '../../src/auth/index.js';
import { type Instant } from '../../src/types/index.js';

/**
 * Arbitrary for attempt records.
 */
export function attemptRecords(): fc.Arbitrary<AttemptRecord[]> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 8.64e15 }),
    )
    .chain(([count, baseTime]) => {
      return fc.tuple(
        fc.constant(count),
        fc.shuffledSubarray(
          Array.from({ length: count }, (_, i) => ({
            failedAt: (baseTime + i * 60000) as Instant, // 1 minute apart
          })),
        ),
      );
    })
    .map(([, records]) => records);
}

/**
 * Arbitrary for rate-limit request timestamps.
 */
export function requestTimestamps(): fc.Arbitrary<Instant[]> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 8.64e15 }),
    )
    .chain(([count, baseTime]) => {
      return fc.tuple(
        fc.constant(count),
        fc.shuffledSubarray(
          Array.from({ length: count }, (_, i) => (baseTime + i * 1000) as Instant), // 1 second apart
        ),
      );
    })
    .map(([, timestamps]) => timestamps);
}

export {};
