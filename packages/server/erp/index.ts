// @campusconnect/server/erp: ERP synchronisation, enrolment guard and data freshness.

export { ErpSyncConsumer, type ErpSyncConsumerOptions, type ErpSyncMessage } from './erp-sync-consumer';
export { EnrolmentGuard } from './enrolment-guard';
export { ErpFreshnessService, type ErpFreshness } from './erp-freshness';
export {
  ENROLMENT_CACHE_TTL_MS,
  ERP_SYNC_PAGE_SIZE,
  ERP_SYNC_QUEUE,
  type EnrolmentState,
} from './erp.types';
