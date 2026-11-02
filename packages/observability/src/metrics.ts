import type { TelemetryContext } from './telemetry-context';
import {
  isRequestIdValue,
  isRouteTemplate,
  isServiceName,
  isTenantIdValue,
  normalizeTenantId,
} from './validation';

/** CloudWatch units used by the platform's metrics. */
export type MetricUnit = 'Count' | 'Milliseconds' | 'Seconds' | 'Percent' | 'Bytes' | 'None';

export interface MetricDatum {
  /** PascalCase metric name such as `RequestDuration` or `QueueDepth`. */
  readonly name: string;
  readonly unit: MetricUnit;
  readonly value: number;
}

/**
 * Dimensions a metric can be broken down by, each with a small, fixed set of values (design: request rate, errors
 * and duration per route; queue depth per queue; AI latency and errors per purpose; delivery outcomes per channel).
 * `Service` is always a dimension. `TenantId` and `RequestId` are written on every record as properties, not
 * dimensions: a request id would create one metric series per request.
 */
export type MetricDimensionName = 'Route' | 'Queue' | 'Purpose' | 'Channel' | 'Outcome';

export type MetricDimensions = Readonly<Partial<Record<MetricDimensionName, string>>>;

/** Dimension names in the order they appear in the dimension set. */
const DIMENSION_NAMES: readonly MetricDimensionName[] = ['Route', 'Queue', 'Purpose', 'Channel', 'Outcome'];

/** Written in place of a Tenant id, request id or dimension value that failed its check. */
export const INVALID_VALUE = 'invalid';

export const DEFAULT_METRIC_NAMESPACE = 'CampusConnect';

/** CloudWatch allows at most 100 metrics in one EMF record. */
export const MAX_METRICS_PER_RECORD = 100;

const METRIC_NAME = /^[A-Z][A-Za-z0-9]{0,254}$/;
const NAMESPACE = /^[A-Za-z0-9_.#:/-]{1,255}$/;
/** Queue names, AI purposes, channel names and outcomes: short identifiers. */
const DIMENSION_VALUE = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Root keys of an EMF record that a metric name must not overwrite. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(['_aws', 'Service', 'TenantId', 'RequestId', ...DIMENSION_NAMES]);

export interface EmfMetricDefinition {
  readonly Name: string;
  readonly Unit: MetricUnit;
}

/** A CloudWatch Embedded Metric Format record. CloudWatch Logs extracts the metrics from the JSON log line. */
export interface EmfRecord {
  readonly _aws: {
    readonly Timestamp: number;
    readonly CloudWatchMetrics: readonly {
      readonly Namespace: string;
      readonly Dimensions: readonly (readonly string[])[];
      readonly Metrics: readonly EmfMetricDefinition[];
    }[];
  };
  readonly Service: string;
  readonly TenantId: string;
  readonly RequestId: string;
  readonly [key: string]: unknown;
}

export interface EmfRecordInput {
  readonly namespace: string;
  readonly service: string;
  /** Milliseconds since the epoch. */
  readonly timestamp: number;
  readonly context: TelemetryContext;
  readonly metrics: readonly MetricDatum[];
  readonly dimensions?: MetricDimensions;
}

function dimensionValueIsValid(name: MetricDimensionName, value: string): boolean {
  return name === 'Route' ? isRouteTemplate(value) : DIMENSION_VALUE.test(value);
}

/**
 * Builds EMF records for one set of metrics, splitting them into records of at most 100 metrics. Every record
 * carries `Service`, `TenantId` and `RequestId` (25.1); a Tenant id, request id or dimension value that fails its
 * check is written as {@link INVALID_VALUE} rather than as given. Metrics with an invalid or reserved name, a
 * repeated name, or a non-finite value are left out. Returns no records when no metric is left.
 */
export function buildEmfRecords(input: EmfRecordInput): EmfRecord[] {
  const metrics: MetricDatum[] = [];
  const seen = new Set<string>();
  for (const metric of input.metrics) {
    if (
      METRIC_NAME.test(metric.name) &&
      !RESERVED_KEYS.has(metric.name) &&
      !seen.has(metric.name) &&
      Number.isFinite(metric.value)
    ) {
      seen.add(metric.name);
      metrics.push(metric);
    }
  }

  const dimensionValues: Record<string, string> = {};
  const dimensionSet = ['Service'];
  for (const name of DIMENSION_NAMES) {
    const value = input.dimensions?.[name];
    if (value !== undefined) {
      dimensionValues[name] = dimensionValueIsValid(name, value) ? value : INVALID_VALUE;
      dimensionSet.push(name);
    }
  }

  const tenantId = isTenantIdValue(input.context.tenantId) ? normalizeTenantId(input.context.tenantId) : INVALID_VALUE;
  const requestId = isRequestIdValue(input.context.requestId) ? input.context.requestId : INVALID_VALUE;

  const records: EmfRecord[] = [];
  for (let start = 0; start < metrics.length; start += MAX_METRICS_PER_RECORD) {
    const chunk = metrics.slice(start, start + MAX_METRICS_PER_RECORD);
    const values: Record<string, number> = {};
    for (const metric of chunk) {
      values[metric.name] = metric.value;
    }
    records.push({
      _aws: {
        Timestamp: input.timestamp,
        CloudWatchMetrics: [
          {
            Namespace: input.namespace,
            Dimensions: [dimensionSet],
            Metrics: chunk.map((metric) => ({ Name: metric.name, Unit: metric.unit })),
          },
        ],
      },
      Service: input.service,
      TenantId: tenantId,
      RequestId: requestId,
      ...dimensionValues,
      ...values,
    });
  }
  return records;
}

export interface MetricsEmitter {
  /**
   * Writes the metrics as EMF records. The context is required, so every metric carries the Tenant id and request
   * id; use `NO_TENANT` and the job run id for platform work.
   */
  emit(context: TelemetryContext, metrics: readonly MetricDatum[], dimensions?: MetricDimensions): void;
}

export interface MetricsEmitterOptions {
  /** Service name, such as `api` or `worker`, written as the `Service` dimension. */
  readonly service: string;
  /** CloudWatch namespace. Defaults to {@link DEFAULT_METRIC_NAMESPACE}. */
  readonly namespace?: string;
  /** Receives each record as one JSON line without a trailing newline. Defaults to writing to standard output. */
  readonly write?: (line: string) => void;
  /** Clock for the record timestamp. Defaults to `Date.now`. */
  readonly now?: () => number;
}

function writeToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Creates an emitter that writes CloudWatch Embedded Metric Format records. */
export function createMetricsEmitter(options: MetricsEmitterOptions): MetricsEmitter {
  if (!isServiceName(options.service)) {
    throw new RangeError('service must be a lower-case service name such as "api".');
  }
  const namespace = options.namespace ?? DEFAULT_METRIC_NAMESPACE;
  if (!NAMESPACE.test(namespace) || namespace.startsWith('AWS/')) {
    throw new RangeError('namespace must be a valid CloudWatch namespace outside "AWS/".');
  }
  const write = options.write ?? writeToStdout;
  const now = options.now ?? (() => Date.now());
  const service = options.service;
  return {
    emit(context, metrics, dimensions) {
      const records = buildEmfRecords({
        namespace,
        service,
        timestamp: now(),
        context,
        metrics,
        ...(dimensions === undefined ? {} : { dimensions }),
      });
      for (const record of records) {
        write(JSON.stringify(record));
      }
    },
  };
}
