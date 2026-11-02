// Breach declaration from the operator console (19.7): notifies each affected Tenant_Admin with the nature of the
// breach, the affected data categories and the approximate number of affected Students.

import { randomUUID } from 'node:crypto';
import { useTenant, type OutboxDatabase } from '../outbox/outbox.types';
import { BREACH_NOTIFY_DEADLINE_MS, type PrivacyNotifier } from './privacy.types';

export interface BreachDeclaration {
  readonly nature: string;
  readonly dataCategories: readonly string[];
  /** Affected Tenants and the approximate number of affected Students in each. */
  readonly tenants: readonly { readonly tenantId: string; readonly approximateStudents: number }[];
  readonly detectedAt: Date;
}

export interface BreachResult {
  readonly declarationId: string;
  readonly notified: readonly { readonly tenantId: string; readonly admins: number }[];
  /** Tenants whose notification was sent after the 72-hour deadline. */
  readonly late: readonly string[];
}

export class BreachService {
  constructor(
    private readonly db: OutboxDatabase,
    private readonly notifier: PrivacyNotifier,
    private readonly now: () => number = Date.now,
  ) {}

  async declare(declaration: BreachDeclaration): Promise<BreachResult> {
    if (declaration.nature.trim() === '') throw new Error('A breach needs a description of its nature.');
    if (declaration.dataCategories.length === 0) throw new Error('A breach needs at least one data category.');
    const declarationId = randomUUID();
    const notified: { tenantId: string; admins: number }[] = [];
    const late: string[] = [];
    const isLate = this.now() - declaration.detectedAt.getTime() > BREACH_NOTIFY_DEADLINE_MS;

    for (const { tenantId, approximateStudents } of declaration.tenants) {
      const admins = await this.db.transaction(async (tx) => {
        await useTenant(tx, tenantId);
        const recipients = await tx.query<{ user_id: string }>(
          `SELECT user_id::text FROM core.user_roles WHERE tenant_id = $1::uuid AND role = 'tenant_admin'`,
          [tenantId],
        );
        for (const r of recipients.rows) {
          await this.notifier.notify(tx, tenantId, r.user_id, {
            type: 'breach',
            nature: declaration.nature,
            dataCategories: declaration.dataCategories,
            approximateStudents,
          });
        }
        await tx.query(
          `INSERT INTO privacy.breaches
             (tenant_id, declaration_id, nature, data_categories, approximate_students, detected_at, notified_at, admins_notified)
           VALUES ($1::uuid, $2::uuid, $3, $4::text[], $5, $6, now(), $7)`,
          [tenantId, declarationId, declaration.nature, [...declaration.dataCategories], approximateStudents, declaration.detectedAt, recipients.rows.length],
        );
        return recipients.rows.length;
      });
      notified.push({ tenantId, admins });
      if (isLate) late.push(tenantId);
    }
    return { declarationId, notified, late };
  }
}
