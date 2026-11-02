// Write-path authorisation input: a Student whose enrolment is inactive may not write (17.9). Status is read from
// `core.students` and cached for at most 30 seconds.

import type { OutboxDatabase } from '../outbox';
import { useTenant } from '../outbox';
import { ENROLMENT_CACHE_TTL_MS, type EnrolmentState } from './erp.types';

export class EnrolmentGuard {
  private readonly cache = new Map<string, { readonly status: EnrolmentState | null; readonly at: number }>();

  constructor(
    private readonly db: OutboxDatabase,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = ENROLMENT_CACHE_TTL_MS,
  ) {}

  /** `null` when the user has no Student record, e.g. staff. */
  async status(tenantId: string, userId: string): Promise<EnrolmentState | null> {
    const key = `${tenantId}:${userId}`;
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit !== undefined && now - hit.at < this.ttlMs) return hit.status;
    const status = await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const result = await tx.query<{ enrolment_status: EnrolmentState }>(
        `SELECT enrolment_status FROM core.students WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [tenantId, userId],
      );
      return result.rows[0]?.enrolment_status ?? null;
    });
    this.cache.set(key, { status, at: now });
    return status;
  }

  /** True when the user may write: staff and active Students. */
  async canWrite(tenantId: string, userId: string): Promise<boolean> {
    return (await this.status(tenantId, userId)) !== 'inactive';
  }

  invalidate(tenantId: string, userId: string): void {
    this.cache.delete(`${tenantId}:${userId}`);
  }
}
