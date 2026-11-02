// SQL for users, roles, students, authentication attempts and MFA factors. All calls run inside a tenant transaction.

import { ROLES, type Role } from '@campusconnect/domain/rbac';
import type { DepartmentId, TenantId, UserId } from '@campusconnect/domain/types';
import type { ErpStudentRecord, IdentitySqlClient } from './identity.types';

export interface UserRecord {
  readonly id: UserId;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly departmentIds: readonly DepartmentId[];
}

export interface MfaFactorRecord {
  readonly secretCiphertext: string;
  readonly confirmed: boolean;
  readonly lastUsedStep: number | undefined;
}

const ROLE_SET: ReadonlySet<string> = new Set(ROLES);
const DAY_MS = 24 * 60 * 60 * 1000;

export class IdentityRepository {
  async findUserBySubject(tx: IdentitySqlClient, tenantId: TenantId, subject: string): Promise<UserRecord | undefined> {
    const user = await tx.query<{ id: string; display_name: string; email: string }>(
      `SELECT id::text AS id, display_name, email FROM core.users
       WHERE tenant_id = $1::uuid AND external_subject = $2`,
      [tenantId, subject],
    );
    const row = user.rows[0];
    if (row === undefined) return undefined;
    return this.loadUser(tx, tenantId, row);
  }

  async findUserById(tx: IdentitySqlClient, tenantId: TenantId, id: UserId): Promise<UserRecord | undefined> {
    const user = await tx.query<{ id: string; display_name: string; email: string }>(
      `SELECT id::text AS id, display_name, email FROM core.users WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, id],
    );
    const row = user.rows[0];
    if (row === undefined) return undefined;
    return this.loadUser(tx, tenantId, row);
  }

  private async loadUser(
    tx: IdentitySqlClient,
    tenantId: TenantId,
    row: { id: string; display_name: string; email: string },
  ): Promise<UserRecord> {
    const [roles, departments] = await Promise.all([
      tx.query<{ role: string }>(
        `SELECT role FROM core.user_roles WHERE tenant_id = $1::uuid AND user_id = $2::uuid ORDER BY role`,
        [tenantId, row.id],
      ),
      tx.query<{ department_id: string }>(
        `SELECT department_id::text AS department_id FROM core.user_departments
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid ORDER BY department_id`,
        [tenantId, row.id],
      ),
    ]);
    return {
      id: row.id as UserId,
      displayName: row.display_name,
      email: row.email,
      roles: roles.rows.map((r) => r.role).filter((r): r is Role => ROLE_SET.has(r)),
      departmentIds: departments.rows.map((d) => d.department_id as DepartmentId),
    };
  }

  /**
   * Creates the user, the `student` role and the Student record in the caller's transaction, so a failure leaves no
   * partial record (17.4). If a concurrent sign-in created the user first, returns the existing one.
   */
  async createStudent(
    tx: IdentitySqlClient,
    tenantId: TenantId,
    subject: string,
    erp: ErpStudentRecord,
    nowMs: number,
  ): Promise<UserRecord> {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.users (tenant_id, external_subject, display_name, email)
       VALUES ($1::uuid, $2, $3, $4)
       ON CONFLICT (tenant_id, external_subject) DO NOTHING
       RETURNING id::text AS id`,
      [tenantId, subject, erp.name, erp.email],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      const existing = await this.findUserBySubject(tx, tenantId, subject);
      if (existing === undefined) throw new Error('User vanished during creation.');
      return existing;
    }
    await tx.query(
      `INSERT INTO core.user_roles (tenant_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'student')`,
      [tenantId, id],
    );
    await tx.query(
      `INSERT INTO core.students (tenant_id, user_id, erp_external_id, roll_number, program, year, erp_department,
                                  hostel, gender, social_category, enrolment_status, erp_synced_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12::double precision / 1000))`,
      [
        tenantId,
        id,
        erp.externalId,
        erp.rollNumber,
        erp.program,
        erp.year,
        erp.department,
        erp.hostel ?? null,
        erp.gender ?? null,
        erp.socialCategory ?? null,
        erp.enrolmentStatus,
        nowMs,
      ],
    );
    return {
      id: id as UserId,
      displayName: erp.name,
      email: erp.email,
      roles: ['student'],
      departmentIds: [],
    };
  }

  /** Failure times since the last success, oldest first, limited to `sinceMs` and later. */
  async failedAttempts(tx: IdentitySqlClient, tenantId: TenantId, accountKey: string, sinceMs: number): Promise<number[]> {
    const result = await tx.query<{ at_ms: string | number }>(
      `SELECT at_ms FROM core.auth_attempts
       WHERE tenant_id = $1::uuid AND account_key = $2 AND success = false AND at_ms >= $3
         AND at_ms > COALESCE((SELECT max(at_ms) FROM core.auth_attempts
                               WHERE tenant_id = $1::uuid AND account_key = $2 AND success = true), 0)
       ORDER BY at_ms ASC`,
      [tenantId, accountKey, sinceMs],
    );
    return result.rows.map((r) => Number(r.at_ms));
  }

  async recordAttempt(
    tx: IdentitySqlClient,
    tenantId: TenantId,
    accountKey: string,
    atMs: number,
    success: boolean,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO core.auth_attempts (tenant_id, account_key, at_ms, success) VALUES ($1::uuid, $2, $3, $4)`,
      [tenantId, accountKey, atMs, success],
    );
    // Attempts are kept 24 hours.
    await tx.query(`DELETE FROM core.auth_attempts WHERE tenant_id = $1::uuid AND account_key = $2 AND at_ms < $3`, [
      tenantId,
      accountKey,
      atMs - DAY_MS,
    ]);
  }

  async getMfaFactor(tx: IdentitySqlClient, tenantId: TenantId, userId: UserId): Promise<MfaFactorRecord | undefined> {
    const result = await tx.query<{
      secret_ciphertext: string;
      confirmed_at: string | null;
      last_used_step: string | number | null;
    }>(
      `SELECT secret_ciphertext, confirmed_at, last_used_step FROM core.mfa_factors
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [tenantId, userId],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      secretCiphertext: row.secret_ciphertext,
      confirmed: row.confirmed_at !== null,
      lastUsedStep: row.last_used_step === null ? undefined : Number(row.last_used_step),
    };
  }

  /** Stores a new unconfirmed factor, replacing an earlier unconfirmed one. A confirmed factor is never replaced. */
  async saveUnconfirmedFactor(
    tx: IdentitySqlClient,
    tenantId: TenantId,
    userId: UserId,
    secretCiphertext: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO core.mfa_factors (tenant_id, user_id, secret_ciphertext)
       VALUES ($1::uuid, $2::uuid, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET secret_ciphertext = EXCLUDED.secret_ciphertext, created_at = now()
         WHERE core.mfa_factors.confirmed_at IS NULL`,
      [tenantId, userId, secretCiphertext],
    );
  }

  /** Marks the factor confirmed (if not yet) and records the accepted time step to block replay. */
  async markFactorUsed(tx: IdentitySqlClient, tenantId: TenantId, userId: UserId, step: number): Promise<boolean> {
    const result = await tx.query(
      `UPDATE core.mfa_factors
       SET confirmed_at = COALESCE(confirmed_at, now()), last_used_step = $3
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND (last_used_step IS NULL OR last_used_step < $3)
       RETURNING user_id`,
      [tenantId, userId, step],
    );
    return result.rows.length > 0;
  }
}
