// @campusconnect/observability: allowlisted structured logging, OpenTelemetry setup and metrics.
export {
  createActorRefHasher,
  hkdfActorRefKeys,
  isActorRef,
  MIN_ACTOR_REF_KEY_BYTES,
  type ActorRef,
  type ActorRefHasher,
  type ActorRefKeyResolver,
} from './actor-ref';
export {
  LOG_FIELD_NAMES,
  sanitizeLogFields,
  type LogFieldName,
  type LogFields,
  type SanitizedLogFields,
} from './log-fields';
export { createLogger, INVALID_EVENT, type Logger, type LoggerOptions, type LogLevel } from './logger';
export {
  buildEmfRecords,
  createMetricsEmitter,
  DEFAULT_METRIC_NAMESPACE,
  INVALID_VALUE,
  MAX_METRICS_PER_RECORD,
  type EmfMetricDefinition,
  type EmfRecord,
  type EmfRecordInput,
  type MetricDatum,
  type MetricDimensionName,
  type MetricDimensions,
  type MetricsEmitter,
  type MetricsEmitterOptions,
  type MetricUnit,
} from './metrics';
export type { TelemetryContext, TelemetryContextProvider } from './telemetry-context';
export {
  AllowlistSpanExporter,
  allowlistSpan,
  DEFAULT_OTLP_TRACES_URL,
  filterSpanAttributes,
  REDACTED_EVENT_NAME,
  REDACTED_SPAN_NAME,
  REQUEST_ID_ATTRIBUTE,
  safeSpanName,
  SPAN_ATTRIBUTE_ALLOWLIST,
  startTracing,
  TelemetryContextSpanProcessor,
  TENANT_ID_ATTRIBUTE,
  type FilteredAttributes,
  type Tracing,
  type TracingOptions,
} from './tracing';
export { NO_TENANT } from './validation';
