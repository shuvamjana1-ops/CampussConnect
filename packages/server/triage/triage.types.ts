// Shared types and helpers for the Triage_Service.

import { AsyncLocalStorage } from 'node:async_hooks';

/** Sends one notification through the Notification_Service. Rejects when delivery fails on every channel. */
export interface TriageNotificationService {
  send(request: {
    readonly tenantId: string;
    readonly userId: string;
    readonly event: 'p0_escalation';
    readonly params: { readonly ticketId: string; readonly departmentId: string | null };
  }): Promise<void>;
}

/** Valkey access for the suggestion cache. */
export interface TriageCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Hard AI deadlines (5.4, 3.5). */
export const TRIAGE_AI_TIMEOUT_MS = 10_000;
export const SUGGEST_AI_TIMEOUT_MS = 3_000;
export const SUGGEST_CACHE_TTL_SECONDS = 600;
export const TRIAGE_REDACTION_DEADLINE_MS = 2_000;
export const TRIAGE_QUEUE = 'triage';
export const TRIAGE_DEADLINE_KIND = 'triage_deadline';

/** The Tenant on whose behalf an AI call runs, so the call-log sink can write under row-level security. */
const aiTenant = new AsyncLocalStorage<string>();

export function runWithAiTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return aiTenant.run(tenantId, fn);
}

export function currentAiTenant(): string | undefined {
  return aiTenant.getStore();
}

/** Rejects with a timeout error when `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
