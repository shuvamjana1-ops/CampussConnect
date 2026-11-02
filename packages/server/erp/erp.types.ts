// Constants and types for ERP synchronisation.

/** Queue the scheduler publishes sync cycles to. */
export const ERP_SYNC_QUEUE = 'erp-sync';

/** Students fetched per `listStudentsChangedSince` call. */
export const ERP_SYNC_PAGE_SIZE = 200;

/** The write-path authorisation reads enrolment status at most this stale (17.9). */
export const ENROLMENT_CACHE_TTL_MS = 30_000;

export type EnrolmentState = 'active' | 'inactive';
