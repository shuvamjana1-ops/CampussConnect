// Ports and constants for the Analytics_Service fact projections.

/** Queue that receives the events this module projects (see `EVENT_QUEUES`). */
export const ANALYTICS_QUEUE = 'analytics';

/** The refresh job runs every 5 minutes on the Aurora reader (design, Scheduled jobs). */
export const FACT_REFRESH_CADENCE_MS = 5 * 60 * 1000;

/** Names of the Ticket statuses the projection reacts to. */
export const RESOLVED_STATUS = 'Resolved (Pending Confirmation)';
export const CLOSED_STATUS = 'Closed';
export const REOPENED_STATUS = 'Reopened';

/** Lists the Tenants whose facts the refresh job rebuilds. The tenancy module implements it. */
export interface TenantLister {
  listActiveTenantIds(): Promise<readonly string[]>;
}
