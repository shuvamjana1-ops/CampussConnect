// @campusconnect/server/workbench: Staff_Workbench queue, triage confirmation and correction, override rate,
// canned replies and the AI summary.

export { WorkbenchService, type WorkbenchServiceOptions } from './workbench.service';
export { CannedReplyService, type CannedReplyServiceOptions } from './canned-replies';
export { BulkReassignService, type BulkReassignServiceOptions } from './bulk-reassign.service';
export { SummaryService, type SummaryServiceOptions } from './summary.service';
export {
  workbenchRoutes,
  type WorkbenchRoute,
  type WorkbenchRouteRequest,
} from './workbench.routes';
export * from './workbench.types';
