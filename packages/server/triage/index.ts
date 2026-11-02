// @campusconnect/server/triage: triage worker, deadline watchdog, AI call log and the suggestion endpoint.

export { TriageConsumer, type TriageConsumerDeps } from './triage-consumer';
export { TriageDeadlineConsumer } from './triage-deadline-consumer';
export { P0Escalator, type P0EscalatorOptions } from './p0-escalation';
export { PostgresAiCallLog } from './ai-call-log';
export {
  SuggestService,
  SuggestValidationError,
  MAX_SUGGEST_TEXT_LENGTH,
  type SuggestActor,
  type SuggestResult,
  type SuggestServiceOptions,
} from './suggest.service';
export { triageRoutes, toTriageProblem, type TriageRoute, type TriageRouteRequest } from './triage.routes';
export * from './triage.types';
