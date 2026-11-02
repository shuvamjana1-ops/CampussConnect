// @campusconnect/erp-adapter: read-only ErpAdapter interface and StubErpAdapter.

export type {
  EnrolmentStatus,
  ErpAdapter,
  ErpCourse,
  ErpPage,
  ErpStudent,
  TenantId,
} from './erp-adapter';
export { ErpCursorError, ErpRecordError, ErpUnavailableError } from './errors';
export { StubErpAdapter } from './stub-erp-adapter';
export { SqlErpStubStore } from './stub-store';
export type {
  ErpStubReader,
  ErpStubWriter,
  StubPosition,
  StubRecord,
  StubRecordKind,
  TenantScopedQuery,
} from './stub-store';
export { DEFAULT_ERP_FIXTURE, seedErpFixture } from './fixtures';
export type { ErpFixture } from './fixtures';
