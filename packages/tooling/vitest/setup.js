import fc from 'fast-check';

// Every property runs at least 100 iterations. Property tests also pass { numRuns: 100 } explicitly,
// so the minimum still holds if this global setting changes.
fc.configureGlobal({ numRuns: 100 });
