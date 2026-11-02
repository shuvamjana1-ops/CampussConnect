// Registry of the outcomes of calls to external dependencies (AI, ERP, SSO, SMS).

/** The external dependencies whose availability the platform tracks (24.5). */
export const DEPENDENCY_NAMES = ['ai', 'erp', 'sso', 'sms'] as const;

export type DependencyName = (typeof DEPENDENCY_NAMES)[number];

export type CallOutcome = 'success' | 'failure';

/** `unknown` until the first call is recorded. `degraded` after `failureThreshold` failures in a row. */
export type DependencyStatus = 'unknown' | 'healthy' | 'degraded';

export interface DependencyState {
  readonly status: DependencyStatus;
  readonly consecutiveFailures: number;
  /** UTC milliseconds of the last successful call. */
  readonly lastSuccessAt?: number;
  /** UTC milliseconds of the last failed call. */
  readonly lastFailureAt?: number;
}

export type DependencySnapshot = Readonly<Record<DependencyName, DependencyState>>;

export interface DependencyHealthOptions {
  /** Consecutive failures that mark a dependency degraded. Defaults to 3. */
  readonly failureThreshold?: number;
  readonly now?: () => number;
}

export const DEFAULT_FAILURE_THRESHOLD = 3;

interface MutableState {
  consecutiveFailures: number;
  lastSuccessAt: number | undefined;
  lastFailureAt: number | undefined;
  calls: number;
}

/**
 * Records call outcomes per dependency. Adapters call `record` after every call; the API reads `degraded()` to
 * set the `degraded` response field and `snapshot()` to serve `/health/dependencies`. It holds counts and
 * timestamps only, so nothing about a request can leak into it.
 */
export class DependencyHealth {
  private readonly threshold: number;
  private readonly now: () => number;
  private readonly states = new Map<DependencyName, MutableState>(
    DEPENDENCY_NAMES.map((name) => [
      name,
      { consecutiveFailures: 0, lastSuccessAt: undefined, lastFailureAt: undefined, calls: 0 },
    ]),
  );

  constructor(options: DependencyHealthOptions = {}) {
    this.threshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.now = options.now ?? Date.now;
  }

  record(name: DependencyName, outcome: CallOutcome): void {
    const state = this.states.get(name);
    if (state === undefined) return;
    state.calls += 1;
    if (outcome === 'success') {
      state.consecutiveFailures = 0;
      state.lastSuccessAt = this.now();
    } else {
      state.consecutiveFailures += 1;
      state.lastFailureAt = this.now();
    }
  }

  /** Runs `call`, records its outcome and returns its result or rethrows its error. */
  async track<T>(name: DependencyName, call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      this.record(name, 'success');
      return result;
    } catch (error) {
      this.record(name, 'failure');
      throw error;
    }
  }

  snapshot(): DependencySnapshot {
    const entries = DEPENDENCY_NAMES.map((name) => [name, this.stateOf(name)] as const);
    return Object.fromEntries(entries) as DependencySnapshot;
  }

  /** Names of the dependencies that are currently degraded, in registry order. */
  degraded(): DependencyName[] {
    return DEPENDENCY_NAMES.filter((name) => this.stateOf(name).status === 'degraded');
  }

  private stateOf(name: DependencyName): DependencyState {
    const state = this.states.get(name);
    if (state === undefined) return { status: 'unknown', consecutiveFailures: 0 };
    const status: DependencyStatus =
      state.consecutiveFailures >= this.threshold ? 'degraded' : state.calls === 0 ? 'unknown' : 'healthy';
    return {
      status,
      consecutiveFailures: state.consecutiveFailures,
      ...(state.lastSuccessAt === undefined ? {} : { lastSuccessAt: state.lastSuccessAt }),
      ...(state.lastFailureAt === undefined ? {} : { lastFailureAt: state.lastFailureAt }),
    };
  }
}
