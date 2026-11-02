// @campusconnect/domain/kanon: k-anonymity gateway for aggregates, clusters and exports.

/** Minimum k floor for aggregates and exports. */
export const MIN_K_ANONYMITY = 5;

declare const safeBrand: unique symbol;

/** An aggregate over `n` distinct subjects. */
export interface Aggregate<T> {
  readonly value: T;
  /** Count of distinct individuals contributing to the aggregate. */
  readonly n: number;
}

/** An aggregate that has passed the k-anonymity gateway. */
export type SafeAggregate<T> = Aggregate<T> & { readonly [safeBrand]: true };

/** Marker returned when an aggregate is suppressed. Carries no value. */
export interface Suppressed {
  readonly suppressed: true;
  readonly threshold: number;
}

export type SuppressResult<T> = SafeAggregate<T> | Suppressed;

export function isSuppressed<T>(r: SuppressResult<T>): r is Suppressed {
  return (r as Suppressed).suppressed === true;
}

/** Threshold for aggregates and exports: max(5, kAnonymity). */
export function aggregateThreshold(kAnonymity: number): number {
  return Math.max(MIN_K_ANONYMITY, Number.isFinite(kAnonymity) ? kAnonymity : MIN_K_ANONYMITY);
}

/** Threshold for spike clusters: spikeClusterK. */
export function clusterThreshold(spikeClusterK: number): number {
  return spikeClusterK;
}

/** Releases the aggregate only when n >= threshold; otherwise returns a suppression marker. */
export function suppress<T>(aggregate: Aggregate<T>, threshold: number): SuppressResult<T> {
  if (Number.isFinite(aggregate.n) && aggregate.n >= threshold) {
    return { value: aggregate.value, n: aggregate.n } as SafeAggregate<T>;
  }
  return { suppressed: true, threshold };
}

export function suppressAggregate<T>(aggregate: Aggregate<T>, kAnonymity: number): SuppressResult<T> {
  return suppress(aggregate, aggregateThreshold(kAnonymity));
}

export function suppressCluster<T>(aggregate: Aggregate<T>, spikeClusterK: number): SuppressResult<T> {
  return suppress(aggregate, clusterThreshold(spikeClusterK));
}
