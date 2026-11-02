// @campusconnect/domain/erp: ERP data freshness rules.

export interface SyncAttempt {
  readonly at: Date;
  readonly succeeded: boolean;
}

export interface FreshnessState {
  /** True if and only if the latest attempt failed. */
  readonly warning: boolean;
  /** Time of the most recent successful sync, or null if none. */
  readonly lastSuccessAt: Date | null;
  /** Last successfully synchronised data stays in use. */
  readonly useLastGoodData: true;
}

/** Derives the data-freshness state from a set of sync attempts (any order). */
export function freshnessState(syncAttempts: readonly SyncAttempt[]): FreshnessState {
  let latest: SyncAttempt | undefined;
  let lastSuccess: SyncAttempt | undefined;
  for (const a of syncAttempts) {
    if (latest === undefined || a.at.getTime() >= latest.at.getTime()) latest = a;
    if (a.succeeded && (lastSuccess === undefined || a.at.getTime() >= lastSuccess.at.getTime())) {
      lastSuccess = a;
    }
  }
  return {
    warning: latest !== undefined && !latest.succeeded,
    lastSuccessAt: lastSuccess?.at ?? null,
    useLastGoodData: true,
  };
}
