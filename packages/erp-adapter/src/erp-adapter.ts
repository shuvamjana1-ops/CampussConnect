/** UUID of a Tenant. Kept as a plain string so this package has no workspace dependencies. */
export type TenantId = string;

export type EnrolmentStatus = 'active' | 'inactive';

/** A Student record as the ERP holds it. The ERP is authoritative for these fields (10.1). */
export interface ErpStudent {
  externalId: string;
  name: string;
  email: string;
  rollNumber: string;
  program: string;
  year: number;
  department: string;
  enrolmentStatus: EnrolmentStatus;
  hostel?: string;
  gender?: string;
  socialCategory?: string;
}

export interface ErpCourse {
  externalId: string;
  code: string;
  name: string;
  department: string;
}

export interface ErpPage<T> {
  items: T[];
  /** Opaque cursor for the next page, or `null` when there are no more items. */
  next: string | null;
}

/**
 * Read-only access to an institution's ERP (17.1).
 * By construction there are no write methods: no module writes to the ERP, SIS or LMS (17.8).
 */
export interface ErpAdapter {
  /** Resolves `null` when the Student is not in the records. Rejects with `ErpUnavailableError` after `timeoutMs`. */
  getStudent(tenantId: TenantId, externalId: string, opts: { timeoutMs: number }): Promise<ErpStudent | null>;

  listStudentsChangedSince(
    tenantId: TenantId,
    cursor: string | null,
    page: { size: number },
  ): Promise<ErpPage<ErpStudent>>;

  listCourses(tenantId: TenantId, cursor: string | null): Promise<ErpPage<ErpCourse>>;
}
