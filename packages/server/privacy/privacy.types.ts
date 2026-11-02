// Shared types for consent, data subject requests, retention and breach notification.

import type { OutboxSqlClient } from '../outbox/outbox.types';

export const DSR_DUE_DAYS = 30;
/** Withdrawn consent must stop processing within this window (19.2). */
export const CONSENT_WITHDRAWAL_MAX_MS = 24 * 60 * 60 * 1000;
/** Breach notification deadline from detection (19.7). */
export const BREACH_NOTIFY_DEADLINE_MS = 72 * 60 * 60 * 1000;

export type ConsentDecision = 'granted' | 'declined' | 'withdrawn';
export type DsrKind = 'export' | 'erasure';
export type DsrStatus = 'open' | 'completed' | 'failed';

export interface ConsentPurpose {
  readonly purpose: string;
  readonly description: string;
  readonly noticeVersion: number;
}

export interface ConsentRecord {
  readonly purpose: string;
  readonly decision: ConsentDecision;
  readonly decidedAt: string;
  readonly withdrawnAt: string | null;
}

/** Raised when a feature needs a consent the user has not granted. Maps to the CONSENT_REQUIRED problem code. */
export class ConsentRequiredError extends Error {
  readonly code = 'CONSENT_REQUIRED';
  constructor(readonly purpose: string) {
    super(`Consent for purpose "${purpose}" is required.`);
  }
}

export class DsrNotFoundError extends Error {
  constructor() {
    super('Data subject request not found.');
  }
}

export class DsrStateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface RetainedCategory {
  readonly category: string;
  readonly reason: string;
}

/**
 * Contract implemented by identity, tickets and notifications. Both calls run inside the DSR transaction, so a
 * throw leaves every module's data unchanged (19.9, 19.10).
 */
export interface SubjectDataProvider {
  readonly category: string;
  exportSubjectData(tx: OutboxSqlClient, tenantId: string, userId: string): Promise<unknown>;
  /** Erases or anonymises the subject's data; returns categories kept because the Tenant must retain them. */
  eraseSubject(tx: OutboxSqlClient, tenantId: string, userId: string): Promise<readonly RetainedCategory[]>;
}

export type PrivacyNotice =
  | { readonly type: 'dsr_export_ready'; readonly requestId: string }
  | { readonly type: 'dsr_erasure_completed'; readonly requestId: string; readonly retained: readonly RetainedCategory[] }
  | { readonly type: 'dsr_failed'; readonly requestId: string; readonly kind: DsrKind; readonly reason: string }
  | { readonly type: 'consent_withdrawal_failed'; readonly purpose: string }
  | {
      readonly type: 'breach';
      readonly nature: string;
      readonly dataCategories: readonly string[];
      readonly approximateStudents: number;
    };

/** Delivered through Notification_Service by the composition root. */
export interface PrivacyNotifier {
  notify(tx: OutboxSqlClient, tenantId: string, userId: string, notice: PrivacyNotice): Promise<void>;
}
