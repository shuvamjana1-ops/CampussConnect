// @campusconnect/server/analytics: fact projections and the 5-minute refresh job.

export { FactConsumer } from './fact-consumer';
export {
  FactRefreshJob,
  loadActivityCounts,
  loadTicketFacts,
  releaseAggregate,
  type FactRefreshJobOptions,
} from './fact-refresh-job';
export { ANALYTICS_QUEUE, FACT_REFRESH_CADENCE_MS, type TenantLister } from './analytics.types';
export { ReportScheduleService, scheduleOf, toScheduleRecord, REPORT_RUN_TIME } from './report-schedule.service';
export { ReportSweeper, type ReportSweeperOptions } from './report-sweeper';
export { DefaultReportRenderer } from './report-renderer';
export { reportRoutes, toReportProblem, type ReportErrorMapping, type ReportRoute, type ReportRouteRequest } from './report.routes';
export * from './report.types';
export {
  AiQualityReportJob,
  GuardrailJob,
  OkrMilestoneJob,
  AI_QUALITY_DEADLINE_MS,
  OKR_MILESTONE_MONTHS,
  type ClassificationSource,
  type GuardrailMeasurement,
  type GuardrailNotifier,
  type GuardrailSource,
  type OkrDirectory,
  type OkrJobOptions,
  type OperationsAlerter,
} from './okr-jobs';
