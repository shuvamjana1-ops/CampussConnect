// Types for Ticket creation (requirements 3.8, 3.9, 3.13, 5.6, 8.1, 23.7).

import type { FieldError } from '@campusconnect/contracts';
import type { TenantId, UserId } from '@campusconnect/domain/types';
import type { PriorityBand } from '../tenancy';

export const TICKET_TYPES = ['request', 'complaint'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 20_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Minimal SQL surface the Ticket module needs. Compatible with the audit and outbox clients. */
export interface TicketSqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** The acting user, as resolved by the guards. */
export interface TicketActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly roles: readonly string[];
  /** Department scope, set into `app.dept_ids`. Empty for Students. */
  readonly departmentIds?: readonly string[];
}

/** Opens a transaction with the actor's Tenant, user, roles and departments set for row-level security. */
export interface TicketDatabase {
  transaction<T>(actor: TicketActor, fn: (tx: TicketSqlClient) => Promise<T>): Promise<T>;
}

/** The body of `POST /tickets`. */
export interface CreateTicketInput {
  readonly type: TicketType;
  readonly title: string;
  readonly description: string;
  /** The category the Student accepted or chose (3.6, 3.7). */
  readonly categoryId: string;
  /** Only Grievances can be confidential (3.8). */
  readonly confidential: boolean;
}

/** The value of the `Idempotency-Key` header. */
export type IdempotencyKey = string;

/** First-response and resolution commitments as durations from the SLA policy (3.13). Working time, in minutes. */
export interface ReceiptCommitments {
  readonly firstResponseMinutes: number;
  readonly resolutionMinutes: number;
}

export interface TicketReceipt {
  readonly ticketId: string;
  /** Human-readable reference, for example `TKT-2026-000123`. */
  readonly ref: string;
  readonly type: TicketType;
  readonly category: { readonly id: string; readonly name: string };
  readonly band: PriorityBand;
  readonly status: string;
  /** Present for confidential Grievances: the reference shown to staff in place of the Student's identity (8.1). */
  readonly anonRef?: string;
  /** Null when no SLA policy covers the band and category. */
  readonly commitments: ReceiptCommitments | null;
  /** UTC milliseconds. */
  readonly createdAt: number;
}

export interface CreateTicketResult {
  /** `201` for a new Ticket, `200` when the idempotency key already produced one (3.9). */
  readonly status: 200 | 201;
  readonly receipt: TicketReceipt;
}

/** Thrown when the submission is out of bounds. Maps to `422 VALIDATION_FAILED`. Nothing has been saved. */
export class TicketValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly fields: readonly FieldError[]) {
    super('Ticket values are invalid.');
    this.name = 'TicketValidationError';
  }
}

/** Thrown when the actor is not a Student. Maps to `403 INSUFFICIENT_PERMISSION`. */
export class TicketPermissionError extends Error {
  readonly code = 'INSUFFICIENT_PERMISSION' as const;

  constructor() {
    super('Only a Student can submit a Ticket.');
    this.name = 'TicketPermissionError';
  }
}
