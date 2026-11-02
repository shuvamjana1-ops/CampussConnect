import type { ErpAdapter, ErpCourse, ErpPage, ErpStudent, TenantId } from './erp-adapter';
import { ErpCursorError, ErpRecordError, ErpUnavailableError } from './errors';
import type { ErpStubReader, StubPosition, StubRecord } from './stub-store';

const MAX_PAGE_SIZE = 500;
const COURSE_PAGE_SIZE = 200;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(obj: Record<string, unknown>, key: string, id: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ErpRecordError(`ERP stub record ${id} has no valid "${key}"`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseStudent(record: StubRecord): ErpStudent {
  const p = record.payload;
  if (!isObject(p)) throw new ErpRecordError(`ERP stub record ${record.externalId} is not an object`);
  const year = p['year'];
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1) {
    throw new ErpRecordError(`ERP stub record ${record.externalId} has no valid "year"`);
  }
  const status = p['enrolmentStatus'];
  if (status !== 'active' && status !== 'inactive') {
    throw new ErpRecordError(`ERP stub record ${record.externalId} has no valid "enrolmentStatus"`);
  }
  const student: ErpStudent = {
    externalId: record.externalId,
    name: requiredString(p, 'name', record.externalId),
    email: requiredString(p, 'email', record.externalId),
    rollNumber: requiredString(p, 'rollNumber', record.externalId),
    program: requiredString(p, 'program', record.externalId),
    year,
    department: requiredString(p, 'department', record.externalId),
    enrolmentStatus: status,
  };
  const hostel = optionalString(p, 'hostel');
  const gender = optionalString(p, 'gender');
  const socialCategory = optionalString(p, 'socialCategory');
  if (hostel !== undefined) student.hostel = hostel;
  if (gender !== undefined) student.gender = gender;
  if (socialCategory !== undefined) student.socialCategory = socialCategory;
  return student;
}

export function parseCourse(record: StubRecord): ErpCourse {
  const p = record.payload;
  if (!isObject(p)) throw new ErpRecordError(`ERP stub record ${record.externalId} is not an object`);
  return {
    externalId: record.externalId,
    code: requiredString(p, 'code', record.externalId),
    name: requiredString(p, 'name', record.externalId),
    department: requiredString(p, 'department', record.externalId),
  };
}

function encodeCursor(position: StubPosition): string {
  return Buffer.from(JSON.stringify([position.updatedAt, position.externalId]), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null): StubPosition | null {
  if (cursor === null) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      !Number.isNaN(Date.parse(parsed[0]))
    ) {
      return { updatedAt: parsed[0], externalId: parsed[1] };
    }
  } catch {
    // fall through to the error below
  }
  throw new ErpCursorError();
}

async function page<T>(
  records: StubRecord[],
  size: number,
  parse: (record: StubRecord) => T,
): Promise<ErpPage<T>> {
  const hasMore = records.length > size;
  const slice = hasMore ? records.slice(0, size) : records;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(parse),
    next: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, externalId: last.externalId }) : null,
  };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ErpUnavailableError(`ERP did not respond within ${timeoutMs} ms`)),
      timeoutMs,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(
          error instanceof ErpUnavailableError || error instanceof ErpRecordError
            ? error
            : new ErpUnavailableError('ERP could not be read', { cause: error }),
        );
      },
    );
  });
}

/**
 * Phase 1 ERP: reads `core.erp_stub_records` through an `ErpStubReader` (17.2).
 * Holds only the read side of the store, so it cannot write even by accident (17.8).
 */
export class StubErpAdapter implements ErpAdapter {
  constructor(private readonly store: ErpStubReader) {}

  async getStudent(tenantId: TenantId, externalId: string, opts: { timeoutMs: number }): Promise<ErpStudent | null> {
    const record = await withTimeout(this.store.get(tenantId, 'student', externalId), opts.timeoutMs);
    return record ? parseStudent(record) : null;
  }

  async listStudentsChangedSince(
    tenantId: TenantId,
    cursor: string | null,
    pageOpts: { size: number },
  ): Promise<ErpPage<ErpStudent>> {
    const size = Math.min(Math.max(1, Math.floor(pageOpts.size)), MAX_PAGE_SIZE);
    const records = await this.store.listAfter(tenantId, 'student', decodeCursor(cursor), size + 1);
    return page(records, size, parseStudent);
  }

  async listCourses(tenantId: TenantId, cursor: string | null): Promise<ErpPage<ErpCourse>> {
    const records = await this.store.listAfter(tenantId, 'course', decodeCursor(cursor), COURSE_PAGE_SIZE + 1);
    return page(records, COURSE_PAGE_SIZE, parseCourse);
  }
}
