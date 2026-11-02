import type { ErpCourse, ErpStudent, TenantId } from './erp-adapter';
import type { ErpStubWriter } from './stub-store';

/** Fixture content for one Tenant. Fixture files are JSON documents of this shape. */
export interface ErpFixture {
  students: ErpStudent[];
  courses: ErpCourse[];
}

/** Small default data set for local development and end-to-end runs. */
export const DEFAULT_ERP_FIXTURE: ErpFixture = {
  students: [
    {
      externalId: 'S1001',
      name: 'Asha Verma',
      email: 'asha.verma@example.edu',
      rollNumber: '21CS1001',
      program: 'B.Tech Computer Science',
      year: 3,
      department: 'Computer Science',
      enrolmentStatus: 'active',
      hostel: 'Block A',
      gender: 'female',
    },
    {
      externalId: 'S1002',
      name: 'Rohan Mehta',
      email: 'rohan.mehta@example.edu',
      rollNumber: '22ME1002',
      program: 'B.Tech Mechanical Engineering',
      year: 2,
      department: 'Mechanical Engineering',
      enrolmentStatus: 'active',
    },
    {
      externalId: 'S1003',
      name: 'Priya Nair',
      email: 'priya.nair@example.edu',
      rollNumber: '19EC1003',
      program: 'B.Tech Electronics',
      year: 4,
      department: 'Electronics',
      enrolmentStatus: 'inactive',
    },
  ],
  courses: [
    { externalId: 'C-CS101', code: 'CS101', name: 'Introduction to Programming', department: 'Computer Science' },
    { externalId: 'C-ME201', code: 'ME201', name: 'Thermodynamics', department: 'Mechanical Engineering' },
  ],
};

/** Writes a fixture into the Tenant's stub records. Idempotent: existing records are overwritten. */
export async function seedErpFixture(
  writer: ErpStubWriter,
  tenantId: TenantId,
  fixture: ErpFixture = DEFAULT_ERP_FIXTURE,
): Promise<void> {
  for (const { externalId, ...payload } of fixture.students) {
    await writer.upsert(tenantId, 'student', externalId, payload);
  }
  for (const { externalId, ...payload } of fixture.courses) {
    await writer.upsert(tenantId, 'course', externalId, payload);
  }
}
