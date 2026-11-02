// @campusconnect/server/matching: matching jobs, recommendations, eligibility checklists and feedback.

export * from './matching.types';
export { Matcher, scoreFromCosine } from './matcher';
export { MatchConsumer } from './match-consumer';
export { MatchingService, type MatchingServiceOptions } from './matching.service';
export * from './matching.routes';
