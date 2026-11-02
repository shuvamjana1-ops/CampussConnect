import { ApiError } from '../../api/client';
import type { SlaState, TicketStatus } from '@campusconnect/ui';

export type Band = 'P0' | 'P1' | 'P2' | 'P3';

export interface QueueRow {
  readonly id: string;
  readonly title: string;
  readonly band: Band;
  readonly status: TicketStatus;
  readonly category: string;
  readonly resolutionDueAt: string | null;
  readonly slaState: SlaState | null;
  readonly needsVerification: boolean;
  readonly assigneeName: string | null;
}

export interface QueuePage {
  readonly items: readonly QueueRow[];
  readonly nextCursor: string | null;
  readonly needsVerificationCount: number;
}

export interface TicketMessage {
  readonly id: string;
  readonly visibility: 'public' | 'internal';
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface TicketDetail {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly band: Band;
  readonly status: TicketStatus;
  readonly category: string;
  readonly categoryOptions: readonly string[];
  readonly needsVerification: boolean;
  readonly escalationLevel: 'L0' | 'L1' | 'L2' | 'L3';
  readonly etaSet: boolean;
  readonly slaState: SlaState | null;
  readonly resolutionDueAt: string | null;
  readonly messages: readonly TicketMessage[];
}

export interface CannedReply {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface L3Grievance {
  readonly id: string;
  readonly title: string;
  readonly workingDaysRemaining: number;
}

export interface OverrideRateRow {
  readonly category: string;
  readonly suggestions: number;
  readonly corrections: number;
  readonly rate: number;
}

export interface FailedItem {
  readonly id: string;
  readonly reason: string;
}

/** Extracts the user-facing message from a problem document. */
export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem?.detail ?? error.problem?.title ?? error.message;
  return 'Something went wrong. Try again.';
}

/** Per-Ticket failures returned by an atomic bulk reassignment (7.9). */
export function failedItems(error: unknown): readonly FailedItem[] {
  if (!(error instanceof ApiError)) return [];
  const raw = error.problem?.['errors'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { id: unknown; reason: unknown } => typeof e === 'object' && e !== null)
    .map((e) => ({ id: String(e.id), reason: String(e.reason) }));
}

export function formatDue(iso: string | null): string {
  return iso === null ? 'Paused' : new Date(iso).toLocaleString();
}
