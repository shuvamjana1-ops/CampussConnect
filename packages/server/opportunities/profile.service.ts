// Student profiles (requirements 10.1 to 10.9): ERP prefill at first sign-in, per-field source, authoritative ERP
// fields, income band behind consent, completeness and `ProfileChanged` events.

import type { ErpAdapter, ErpStudent } from '@campusconnect/erp-adapter';
import { completeness } from '@campusconnect/domain/profile';
import { ERP_PREFILL_POLICY, retryDelayMs, type RetryPolicy } from '@campusconnect/domain/retry';
import { ConsentRequiredError } from '../privacy/privacy.types';
import { enqueueEvent } from '../outbox';
import {
  DEFAULT_MATCHING_FIELDS,
  ERP_FIELDS,
  ErpFieldReadOnlyError,
  INCOME_BAND_PURPOSE,
  PROFILE_PREFILL_TIMEOUT_MS,
  ProfileNotFoundError,
  ProfileValidationError,
  STUDENT_FIELDS,
  type CompletenessView,
  type PrefillFailureNotifier,
  type PrefillStatus,
  type ProfileActor,
  type ProfileDatabase,
  type ProfileFields,
  type ProfileSqlClient,
  type ProfileView,
} from './profile.types';

export interface ProfileServiceOptions {
  readonly database: ProfileDatabase;
  readonly erp: ErpAdapter;
  readonly notifier?: PrefillFailureNotifier;
  /** Tenant's matching-relevant fields for completeness (10.9). */
  readonly matchingFields?: readonly string[];
  readonly now?: () => number;
}

interface ProfileRow {
  fields: Record<string, { value: unknown; source: 'erp' | 'student'; updatedAt: number }>;
  prefill_status: PrefillStatus;
  prefill_notice: boolean;
  embedding_stale: boolean;
  prefill_attempts: number;
}

const ERP_FIELD_SET: ReadonlySet<string> = new Set(ERP_FIELDS);
const STUDENT_FIELD_SET: ReadonlySet<string> = new Set(STUDENT_FIELDS);
const LIST_FIELDS: ReadonlySet<string> = new Set(['skills', 'interests', 'achievements', 'preferredLocations']);
const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;

/** ERP record to profile values. Absent optional values are left out so they count as missing. */
export function erpFieldValues(student: ErpStudent): Record<string, unknown> {
  const values: Record<string, unknown> = {
    rollNumber: student.rollNumber,
    program: student.program,
    year: student.year,
    department: student.department,
    hostel: student.hostel,
    gender: student.gender,
    socialCategory: student.socialCategory,
  };
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null));
}

function validateStudentValue(name: string, value: unknown): string | undefined {
  if (value === null) return undefined;
  if (LIST_FIELDS.has(name)) {
    const ok =
      Array.isArray(value) &&
      value.length <= MAX_LIST_ITEMS &&
      value.every((v) => typeof v === 'string' && v.trim().length >= 1 && v.length <= MAX_ITEM_LENGTH);
    return ok ? undefined : 'list';
  }
  if (name === 'cgpa') return typeof value === 'number' && value >= 0 && value <= 10 ? undefined : 'range';
  if (name === 'graduationYear') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1990 && value <= 2100 ? undefined : 'range';
  }
  if (name === 'incomeBand') return typeof value === 'string' && value.length >= 1 && value.length <= 32 ? undefined : 'length';
  return 'unknown_field';
}

export class ProfileService {
  private readonly db: ProfileDatabase;
  private readonly erp: ErpAdapter;
  private readonly now: () => number;
  private readonly matchingFields: readonly string[];

  constructor(private readonly options: ProfileServiceOptions) {
    this.db = options.database;
    this.erp = options.erp;
    this.now = options.now ?? Date.now;
    this.matchingFields = options.matchingFields ?? DEFAULT_MATCHING_FIELDS;
  }

  /**
   * Returns the Student's profile, creating it on first access. First access prefills from the ERP within 10 seconds
   * and marks the fields authoritative; on failure an empty profile is created with a notice and a retry schedule
   * under ERP_PREFILL_POLICY (10.1, 10.2).
   */
  async getProfile(actor: ProfileActor): Promise<ProfileView> {
    const existing = await this.db.transaction(actor, (tx) => this.load(tx, actor, false));
    if (existing !== undefined) return toView(existing);

    const externalId = await this.db.transaction(actor, async (tx) => {
      const r = await tx.query<{ erp_external_id: string }>(
        `SELECT erp_external_id FROM core.students WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [actor.tenantId, actor.userId],
      );
      return r.rows[0]?.erp_external_id;
    });
    if (externalId === undefined) throw new ProfileNotFoundError();

    const student = await this.fetchErp(actor.tenantId, externalId);
    return this.db.transaction(actor, async (tx) => {
      const at = this.now();
      const fields = student === undefined ? {} : this.erpFields(student, at);
      await tx.query(
        `INSERT INTO opps.student_profiles
           (tenant_id, user_id, fields, prefill_status, prefill_notice, prefill_next_at)
         VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5,
                 CASE WHEN $4 = 'pending' THEN now() + ($6::bigint * interval '1 millisecond') END)
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [
          actor.tenantId,
          actor.userId,
          JSON.stringify(fields),
          student === undefined ? 'pending' : 'prefilled',
          student === undefined,
          delayOf(ERP_PREFILL_POLICY),
        ],
      );
      const row = await this.load(tx, actor, false);
      if (row === undefined) throw new Error('Profile insert returned no row.');
      if (student !== undefined) await this.emitChanged(tx, actor, Object.keys(fields));
      return toView(row);
    });
  }

  /**
   * Saves Student-managed fields (10.3). Editing an ERP-managed field is rejected and nothing is saved (10.4). A
   * `null` value clears a field. An income band is stored only while consent for `income_band_matching` is granted (10.5).
   */
  async updateFields(actor: ProfileActor, patch: Readonly<Record<string, unknown>>): Promise<ProfileView> {
    const names = Object.keys(patch);
    const readOnly = names.filter((n) => ERP_FIELD_SET.has(n));
    if (readOnly.length > 0) throw new ErpFieldReadOnlyError(readOnly);
    const invalid = names
      .filter((n) => !STUDENT_FIELD_SET.has(n) || validateStudentValue(n, patch[n]) !== undefined)
      .map((n) => ({ path: n, rule: validateStudentValue(n, patch[n]) ?? 'unknown_field' }));
    if (invalid.length > 0) throw new ProfileValidationError(invalid);

    await this.getProfile(actor);
    return this.db.transaction(actor, async (tx) => {
      const row = await this.load(tx, actor, true);
      if (row === undefined) throw new ProfileNotFoundError();
      if (patch.incomeBand !== undefined && patch.incomeBand !== null) await this.assertIncomeConsent(tx, actor);

      const at = this.now();
      const fields: Record<string, unknown> = { ...row.fields };
      const changed: string[] = [];
      for (const name of names) {
        const value = patch[name];
        const before = row.fields[name]?.value;
        if (value === null) {
          if (name in fields) {
            delete fields[name];
            changed.push(name);
          }
        } else if (JSON.stringify(before) !== JSON.stringify(value)) {
          fields[name] = { value, source: 'student', updatedAt: at };
          changed.push(name);
        }
      }
      if (changed.length > 0) {
        await this.save(tx, actor, fields);
        await this.emitChanged(tx, actor, changed);
      }
      return toView({ ...row, fields: fields as ProfileRow['fields'] });
    });
  }

  /** Deletes the stored income band when consent is withdrawn and enqueues re-matching (10.6). Idempotent. */
  async removeIncomeBand(tenantId: string, userId: string): Promise<void> {
    const actor = { tenantId, userId };
    await this.db.transaction(actor, async (tx) => {
      const row = await this.load(tx, actor, true);
      if (row === undefined || !('incomeBand' in row.fields)) return;
      const fields = { ...row.fields } as Record<string, unknown>;
      delete fields.incomeBand;
      await this.save(tx, actor, fields);
      await this.emitChanged(tx, actor, ['incomeBand']);
    });
  }

  /** Percentage of filled matching-relevant fields, with the missing ones (10.9). */
  async getCompleteness(actor: ProfileActor): Promise<CompletenessView> {
    const profile = await this.getProfile(actor);
    const values = Object.fromEntries(Object.entries(profile.fields).map(([k, v]) => [k, v.value]));
    return completeness(values, this.matchingFields);
  }

  /**
   * Retries ERP prefill for profiles that are due, at most `ERP_PREFILL_POLICY.maxRetries` times 5 minutes apart.
   * After the last failure the Student is notified (10.2). Run periodically. Returns the number prefilled.
   */
  async runPrefillRetries(tenantId: string, limit = 50): Promise<number> {
    const due = await this.db.transaction({ tenantId }, async (tx) => {
      const r = await tx.query<{ user_id: string; erp_external_id: string }>(
        `SELECT p.user_id::text AS user_id, s.erp_external_id
           FROM opps.student_profiles p
           JOIN core.students s ON s.tenant_id = p.tenant_id AND s.user_id = p.user_id
          WHERE p.tenant_id = $1::uuid AND p.prefill_status = 'pending' AND p.prefill_next_at <= now()
          ORDER BY p.prefill_next_at LIMIT $2`,
        [tenantId, limit],
      );
      return r.rows;
    });
    let prefilled = 0;
    for (const { user_id: userId, erp_external_id: externalId } of due) {
      const student = await this.fetchErp(tenantId, externalId);
      const actor = { tenantId, userId };
      const ok = await this.db.transaction(actor, async (tx) => {
        const row = await this.load(tx, actor, true);
        if (row === undefined || row.prefill_status !== 'pending') return false;
        if (student !== undefined) {
          const fields = { ...row.fields, ...this.erpFields(student, this.now()) };
          await tx.query(
            `UPDATE opps.student_profiles
                SET fields = $3::jsonb, prefill_status = 'prefilled', prefill_notice = false, prefill_next_at = NULL,
                    updated_at = now()
              WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
            [tenantId, userId, JSON.stringify(fields)],
          );
          await this.emitChanged(tx, actor, Object.keys(erpFieldValues(student)));
          return true;
        }
        const attempts = row.prefill_attempts + 1;
        const exhausted = attempts >= ERP_PREFILL_POLICY.maxRetries;
        await tx.query(
          `UPDATE opps.student_profiles
              SET prefill_attempts = $3, prefill_status = $4, updated_at = now(),
                  prefill_next_at = CASE WHEN $4 = 'pending' THEN now() + ($5::bigint * interval '1 millisecond') END
            WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
          [tenantId, userId, attempts, exhausted ? 'unavailable' : 'pending', delayOf(ERP_PREFILL_POLICY)],
        );
        if (exhausted) await this.options.notifier?.prefillUnavailable(tx, tenantId, userId);
        return false;
      });
      if (ok) prefilled += 1;
    }
    return prefilled;
  }

  /** Profile data for a data subject access request (19.3). Embeddings are derived data and are not exported. */
  async exportSubjectData(tx: ProfileSqlClient, tenantId: string, userId: string): Promise<unknown> {
    const row = await this.load(tx, { tenantId, userId }, false);
    if (row === undefined) return null;
    return {
      fields: row.fields,
      prefillStatus: row.prefill_status,
      completeness: completeness(
        Object.fromEntries(Object.entries(row.fields).map(([k, v]) => [k, v.value])),
        this.matchingFields,
      ),
    };
  }

  /** Deletes the profile and its embedding (19.4). Nothing in the profile must be retained. */
  async eraseSubject(tx: ProfileSqlClient, tenantId: string, userId: string): Promise<readonly never[]> {
    await tx.query(`DELETE FROM opps.student_profiles WHERE tenant_id = $1::uuid AND user_id = $2::uuid`, [
      tenantId,
      userId,
    ]);
    return [];
  }

  private async fetchErp(tenantId: string, externalId: string): Promise<ErpStudent | undefined> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('ERP prefill timed out.')), PROFILE_PREFILL_TIMEOUT_MS);
    });
    try {
      const student = await Promise.race([
        this.erp.getStudent(tenantId, externalId, { timeoutMs: PROFILE_PREFILL_TIMEOUT_MS }),
        timeout,
      ]);
      return student ?? undefined;
    } catch {
      return undefined;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private erpFields(student: ErpStudent, at: number): ProfileFields {
    return Object.fromEntries(
      Object.entries(erpFieldValues(student)).map(([name, value]) => [name, { value, source: 'erp', updatedAt: at }]),
    );
  }

  private async load(tx: ProfileSqlClient, actor: ProfileActor, lock: boolean): Promise<ProfileRow | undefined> {
    const r = await tx.query<ProfileRow>(
      `SELECT fields, prefill_status, prefill_notice, embedding_stale, prefill_attempts
         FROM opps.student_profiles WHERE tenant_id = $1::uuid AND user_id = $2::uuid${lock ? ' FOR UPDATE' : ''}`,
      [actor.tenantId, actor.userId],
    );
    return r.rows[0];
  }

  private async save(tx: ProfileSqlClient, actor: ProfileActor, fields: Record<string, unknown>): Promise<void> {
    await tx.query(
      `UPDATE opps.student_profiles SET fields = $3::jsonb, updated_at = now()
        WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [actor.tenantId, actor.userId, JSON.stringify(fields)],
    );
  }

  private async assertIncomeConsent(tx: ProfileSqlClient, actor: ProfileActor): Promise<void> {
    const r = await tx.query(
      `SELECT 1 FROM privacy.consents
        WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND purpose = $3 AND decision = 'granted'`,
      [actor.tenantId, actor.userId, INCOME_BAND_PURPOSE],
    );
    if (r.rows.length === 0) throw new ConsentRequiredError(INCOME_BAND_PURPOSE);
  }

  private async emitChanged(tx: ProfileSqlClient, actor: ProfileActor, changedFields: readonly string[]): Promise<void> {
    await enqueueEvent(tx, {
      type: 'ProfileChanged',
      version: 1,
      tenantId: actor.tenantId,
      payload: { studentId: actor.userId, changedFields: [...changedFields] },
    });
  }
}

function delayOf(policy: RetryPolicy): number {
  return retryDelayMs(policy, 0);
}

function toView(row: ProfileRow): ProfileView {
  return {
    fields: row.fields,
    prefillStatus: row.prefill_status,
    erpUnavailableNotice: row.prefill_notice && row.prefill_status !== 'prefilled',
    embeddingStale: row.embedding_stale,
  };
}
