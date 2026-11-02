// Per-purpose consent (19.1, 19.2) and the CONSENT_REQUIRED feature guard.

import { useTenant, type OutboxDatabase, type OutboxSqlClient } from '../outbox/outbox.types';
import {
  ConsentRequiredError,
  type ConsentDecision,
  type ConsentPurpose,
  type ConsentRecord,
  type PrivacyNotifier,
} from './privacy.types';

interface ConsentRow {
  purpose: string;
  decision: ConsentDecision;
  decided_at: Date | string;
  withdrawn_at: Date | string | null;
}

const iso = (value: Date | string): string => new Date(value).toISOString();

export class ConsentService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly notifier?: PrivacyNotifier,
  ) {}

  /** The privacy notice shown at first sign-in: the Tenant's optional purposes and whether the user has decided on each. */
  async firstSignInNotice(
    tenantId: string,
    userId: string,
  ): Promise<{ purposes: readonly ConsentPurpose[]; pending: readonly string[] }> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const purposes = await tx.query<{ purpose: string; description: string; notice_version: number }>(
        `SELECT purpose, description, notice_version FROM privacy.consent_purposes
         WHERE tenant_id = $1::uuid ORDER BY purpose`,
        [tenantId],
      );
      const decided = await tx.query<{ purpose: string }>(
        `SELECT purpose FROM privacy.consents WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [tenantId, userId],
      );
      const done = new Set(decided.rows.map((r) => r.purpose));
      return {
        purposes: purposes.rows.map((r) => ({
          purpose: r.purpose,
          description: r.description,
          noticeVersion: r.notice_version,
        })),
        pending: purposes.rows.filter((r) => !done.has(r.purpose)).map((r) => r.purpose),
      };
    });
  }

  /** Records one decision per purpose with a timestamp. Every purpose in the batch commits or none does. */
  async recordDecisions(
    tenantId: string,
    userId: string,
    decisions: Readonly<Record<string, 'granted' | 'declined'>>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      for (const [purpose, decision] of Object.entries(decisions)) {
        await this.write(tx, tenantId, userId, purpose, decision);
      }
    });
  }

  /**
   * Withdraws a consent. Because every guarded request reads the row, the withdrawal applies from the next request;
   * background jobs call `hasConsent` per item, so they stop well inside 24 hours. A failure leaves state unchanged,
   * tells the user and can be resubmitted (19.10).
   */
  async withdraw(tenantId: string, userId: string, purpose: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        const existing = await tx.query(
          `SELECT 1 FROM privacy.consents WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND purpose = $3`,
          [tenantId, userId, purpose],
        );
        if (existing.rows.length === 0) throw new Error(`No consent on record for purpose "${purpose}".`);
        await this.write(tx, tenantId, userId, purpose, 'withdrawn');
      });
    } catch (error) {
      await this.notifyFailure(tenantId, userId, purpose);
      throw error;
    }
  }

  async list(tenantId: string, userId: string): Promise<readonly ConsentRecord[]> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      const rows = await tx.query<ConsentRow>(
        `SELECT purpose, decision, decided_at, withdrawn_at FROM privacy.consents
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid ORDER BY purpose`,
        [tenantId, userId],
      );
      return rows.rows.map((r) => ({
        purpose: r.purpose,
        decision: r.decision,
        decidedAt: iso(r.decided_at),
        withdrawnAt: r.withdrawn_at === null ? null : iso(r.withdrawn_at),
      }));
    });
  }

  /** Uncached read: used by the guard on every request and by jobs before processing each item. */
  async hasConsent(tenantId: string, userId: string, purpose: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await useTenant(tx, tenantId);
      return this.hasConsentIn(tx, tenantId, userId, purpose);
    });
  }

  async hasConsentIn(tx: OutboxSqlClient, tenantId: string, userId: string, purpose: string): Promise<boolean> {
    const rows = await tx.query<{ decision: ConsentDecision }>(
      `SELECT decision FROM privacy.consents
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND purpose = $3`,
      [tenantId, userId, purpose],
    );
    return rows.rows[0]?.decision === 'granted';
  }

  private async write(
    tx: OutboxSqlClient,
    tenantId: string,
    userId: string,
    purpose: string,
    decision: ConsentDecision,
  ): Promise<void> {
    const known = await tx.query<{ notice_version: number }>(
      `SELECT notice_version FROM privacy.consent_purposes WHERE tenant_id = $1::uuid AND purpose = $2`,
      [tenantId, purpose],
    );
    const version = known.rows[0]?.notice_version;
    if (version === undefined) throw new Error(`Unknown consent purpose "${purpose}".`);
    await tx.query(
      `INSERT INTO privacy.consents (tenant_id, user_id, purpose, decision, notice_version, decided_at, withdrawn_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, now(), CASE WHEN $4 = 'withdrawn' THEN now() END)
       ON CONFLICT (tenant_id, user_id, purpose) DO UPDATE
         SET decision = EXCLUDED.decision, notice_version = EXCLUDED.notice_version,
             decided_at = EXCLUDED.decided_at, withdrawn_at = EXCLUDED.withdrawn_at, updated_at = now()`,
      [tenantId, userId, purpose, decision, version],
    );
    await tx.query(
      `INSERT INTO privacy.consent_events (tenant_id, user_id, purpose, decision) VALUES ($1::uuid, $2::uuid, $3, $4)`,
      [tenantId, userId, purpose, decision],
    );
  }

  private async notifyFailure(tenantId: string, userId: string, purpose: string): Promise<void> {
    if (!this.notifier) return;
    try {
      await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        await this.notifier?.notify(tx, tenantId, userId, { type: 'consent_withdrawal_failed', purpose });
      });
    } catch {
      // The caller still receives the original error, which the UI shows as the error indication.
    }
  }
}

/** CONSENT_REQUIRED feature guard: place in front of any feature that depends on a consent purpose. */
export class ConsentGuard {
  constructor(private readonly consents: ConsentService) {}

  async require(tenantId: string, userId: string, purpose: string): Promise<void> {
    if (!(await this.consents.hasConsent(tenantId, userId, purpose))) throw new ConsentRequiredError(purpose);
  }
}
