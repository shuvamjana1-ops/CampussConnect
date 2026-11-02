import type { TicketStatus } from '@campusconnect/ui';
import { useCallback } from 'react';
import { ApiError } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { NEEDS_CONNECTION_MESSAGE } from '../../pwa/OfflineIndicator';

export const DESCRIPTION_MAX = 5000;
export const SUGGEST_MIN_CHARS = 20;
export const SUGGEST_TIMEOUT_MS = 3000;
export const CSAT_COMMENT_MAX = 1000;
export const REASON_MAX = 500;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_LIMIT = 5;
export const ATTACHMENT_TYPES: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'];

export type TicketType = 'Request' | 'Complaint';

export interface HistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly fromStatus: TicketStatus | null;
  readonly toStatus: TicketStatus;
  readonly reason: string;
}

export interface TicketSummary {
  readonly id: string;
  readonly reference: string;
  readonly type: TicketType;
  readonly status: TicketStatus;
  readonly departmentName: string | null;
  readonly categoryName: string | null;
  readonly firstResponseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly updatedAt: string;
}

export interface TicketDetail extends TicketSummary {
  readonly description: string;
  readonly version: number;
  readonly confidential: boolean;
  readonly history: readonly HistoryEntry[];
  readonly closureReason?: string | null;
  readonly autoConfirmed?: boolean;
  /** End of the 7-day confirmation window while the Ticket is Resolved (Pending Confirmation). */
  readonly confirmationWindowEndsAt?: string | null;
  readonly rating?: number | null;
}

export interface Category {
  readonly id: string;
  readonly name: string;
}

export interface TicketReceipt {
  readonly id: string;
  readonly reference: string;
  readonly categoryName: string | null;
  readonly firstResponseDueAt: string;
  readonly resolutionDueAt: string;
}

export interface FieldProblem {
  readonly path: string;
  readonly rule: string;
}

export function fieldErrors(error: unknown): readonly FieldProblem[] {
  if (!(error instanceof ApiError)) return [];
  const fields = error.problem?.fields;
  return Array.isArray(fields) ? (fields as FieldProblem[]) : [];
}

export function problemCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.problem?.code : undefined;
}

/** A thrown `fetch` failure (no response) means the network is unavailable. */
export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export type Translate = (key: string, vars?: Readonly<Record<string, string | number>>) => string;

/** Translator for the `student` namespace with `{{name}}` interpolation. */
export function useT(): Translate {
  const { t } = useI18n();
  return useCallback<Translate>(
    (key, vars) => {
      let text = t(`student:${key}`);
      for (const [name, value] of Object.entries(vars ?? {})) text = text.split(`{{${name}}}`).join(String(value));
      return text;
    },
    [t],
  );
}

export function describeError(error: unknown, t: Translate): string {
  if (isNetworkError(error)) return t('needsConnection') || NEEDS_CONNECTION_MESSAGE;
  const code = problemCode(error);
  if (code !== undefined) {
    const key = `error.${code}`;
    const text = t(key);
    if (text !== `student:${key}` && text !== key) return text;
  }
  return t('error.generic');
}

export function formatTime(iso: string | number | null | undefined, locale: string): string {
  if (iso === null || iso === undefined) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
