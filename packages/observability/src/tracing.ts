import {
  context,
  propagation,
  trace,
  type Attributes,
  type Link,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  TracerProvider,
  type ReadableSpan,
  type Span,
  type SpanExporter,
  type SpanProcessor,
  type TimedEvent,
} from "@opentelemetry/sdk-trace";

import type { TelemetryContextProvider } from "./telemetry-context";
import {
  isRequestIdValue,
  isRouteTemplate,
  isServiceName,
  isTenantIdValue,
} from "./validation";

export const TENANT_ID_ATTRIBUTE = "tenant.id";
export const REQUEST_ID_ATTRIBUTE = "request.id";

/**
 * The only span attributes that leave the process: `tenant.id`, `request.id` and technical attributes from the
 * OpenTelemetry semantic conventions (25.1). Attributes that can hold PII or free text are left out on purpose:
 * `url.full`, `url.path` and `url.query` (ids and search terms), `db.query.text` (parameters), `client.address`
 * and `user_agent.original` (personal data), `enduser.*`, and `exception.message` and `exception.stacktrace`
 * (error text can echo user input).
 */
export const SPAN_ATTRIBUTE_ALLOWLIST: ReadonlySet<string> = new Set([
  TENANT_ID_ATTRIBUTE,
  REQUEST_ID_ATTRIBUTE,
  "http.request.method",
  "http.route",
  "http.response.status_code",
  "url.scheme",
  "network.protocol.name",
  "network.protocol.version",
  "server.address",
  "server.port",
  "error.type",
  "exception.type",
  "db.system.name",
  "db.namespace",
  "db.operation.name",
  "db.collection.name",
  "messaging.system",
  "messaging.operation.type",
  "messaging.operation.name",
  "messaging.destination.name",
  "messaging.batch.message_count",
  "rpc.system",
  "rpc.service",
  "rpc.method",
  "cloud.region",
]);

/** Technical string values: identifiers, host names, codes and route templates. No spaces, `@` or query strings. */
const TECHNICAL_STRING = /^[A-Za-z0-9_.:/{}-]{1,256}$/;

/** Span and event names: a few words of identifier characters, such as `GET /api/v1/tickets/:id`. */
const SPAN_NAME = /^[A-Za-z0-9 _.:/{}-]{1,128}$/;

/** Replaces a span name that could hold a raw path or free text. */
export const REDACTED_SPAN_NAME = "span";

/** Replaces an event name that could hold free text. */
export const REDACTED_EVENT_NAME = "event";

function isAllowedAttribute(key: string, value: unknown): boolean {
  if (!SPAN_ATTRIBUTE_ALLOWLIST.has(key)) {
    return false;
  }
  switch (key) {
    case TENANT_ID_ATTRIBUTE:
      return isTenantIdValue(value);
    case REQUEST_ID_ATTRIBUTE:
      return isRequestIdValue(value);
    case "http.route":
      return isRouteTemplate(value);
    default:
      return (
        (typeof value === "string" && TECHNICAL_STRING.test(value)) ||
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean"
      );
  }
}

export interface FilteredAttributes {
  readonly attributes: Attributes;
  /** How many attributes were removed. */
  readonly removed: number;
}

/** Keeps the attributes on {@link SPAN_ATTRIBUTE_ALLOWLIST} whose values pass their checks. */
export function filterSpanAttributes(
  attributes: Attributes,
): FilteredAttributes {
  const kept: Attributes = {};
  let removed = 0;
  for (const [key, value] of Object.entries(attributes)) {
    if (isAllowedAttribute(key, value)) {
      kept[key] = value;
    } else {
      removed += 1;
    }
  }
  return { attributes: kept, removed };
}

/**
 * Span names come from instrumentation and code. A name is kept when it uses only identifier characters and every
 * word that starts with `/` is a route template, so `GET /api/v1/tickets/:id` is kept and a raw path is replaced.
 */
export function safeSpanName(name: string): string {
  if (!SPAN_NAME.test(name)) {
    return REDACTED_SPAN_NAME;
  }
  const routesAreTemplates = name
    .split(" ")
    .every((word) => !word.startsWith("/") || isRouteTemplate(word));
  return routesAreTemplates ? name : REDACTED_SPAN_NAME;
}

function filterEvent(event: TimedEvent): TimedEvent {
  const name = SPAN_NAME.test(event.name) ? event.name : REDACTED_EVENT_NAME;
  if (event.attributes === undefined) {
    return { ...event, name };
  }
  const filtered = filterSpanAttributes(event.attributes);
  return {
    time: event.time,
    name,
    attributes: filtered.attributes,
    droppedAttributesCount:
      (event.droppedAttributesCount ?? 0) + filtered.removed,
  };
}

function filterLink(link: Link): Link {
  if (link.attributes === undefined) {
    return link;
  }
  const filtered = filterSpanAttributes(link.attributes);
  return {
    context: link.context,
    attributes: filtered.attributes,
    droppedAttributesCount:
      (link.droppedAttributesCount ?? 0) + filtered.removed,
  };
}

/**
 * Returns a copy of `span` that holds only allowlisted attributes on the span, its events and its links, a safe
 * span name, and the status code without the status message (which can carry error text). Removed attributes
 * are added to the dropped-attribute counts.
 */
export function allowlistSpan(span: ReadableSpan): ReadableSpan {
  const filtered = filterSpanAttributes(span.attributes);
  return {
    name: safeSpanName(span.name),
    kind: span.kind,
    spanContext: () => span.spanContext(),
    ...(span.parentSpanContext === undefined
      ? {}
      : { parentSpanContext: span.parentSpanContext }),
    startTime: span.startTime,
    endTime: span.endTime,
    status: { code: span.status.code },
    attributes: filtered.attributes,
    links: span.links.map(filterLink),
    events: span.events.map(filterEvent),
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount + filtered.removed,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

/**
 * Applies {@link allowlistSpan} to every span before handing it to the wrapped exporter, so no span leaves the
 * process with an attribute outside the allowlist, whatever instrumentation or code set it.
 */
export class AllowlistSpanExporter implements SpanExporter {
  readonly #delegate: SpanExporter;

  constructor(delegate: SpanExporter) {
    this.#delegate = delegate;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.#delegate.export(spans.map(allowlistSpan), resultCallback);
  }

  shutdown(): Promise<void> {
    return this.#delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.#delegate.forceFlush?.() ?? Promise.resolve();
  }
}

/**
 * Sets `tenant.id` and `request.id` from the current {@link TelemetryContextProvider} on every span when it starts,
 * including spans created by instrumentation libraries (25.1).
 */
export class TelemetryContextSpanProcessor implements SpanProcessor {
  readonly #getContext: TelemetryContextProvider;

  constructor(getContext: TelemetryContextProvider) {
    this.#getContext = getContext;
  }

  onStart(span: Span): void {
    const current = this.#getContext();
    if (current === undefined) {
      return;
    }
    span.setAttribute(TENANT_ID_ATTRIBUTE, current.tenantId);
    span.setAttribute(REQUEST_ID_ATTRIBUTE, current.requestId);
  }

  onEnd(): void {
    // Nothing to do: attributes are filtered on export by AllowlistSpanExporter.
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/** The ADOT collector sidecar's OTLP/HTTP traces endpoint. The collector exports to X-Ray. */
export const DEFAULT_OTLP_TRACES_URL = "http://localhost:4318/v1/traces";

export interface TracingOptions {
  /** Service name, such as `api` or `staff`. Becomes the `service.name` resource attribute. */
  readonly serviceName: string;
  readonly serviceVersion?: string;
  /** Deployment environment, such as `staging` or `production`. */
  readonly environment?: string;
  /** Supplies `tenant.id` and `request.id` for spans started during a request. */
  readonly getContext: TelemetryContextProvider;
  /** OTLP/HTTP traces endpoint. Defaults to {@link DEFAULT_OTLP_TRACES_URL}. */
  readonly otlpTracesUrl?: string;
  /** Replaces the OTLP exporter, for example with an in-memory exporter in tests. The allowlist still applies. */
  readonly exporter?: SpanExporter;
}

export interface Tracing {
  readonly tracerProvider: TracerProvider;
  /** Flushes pending spans, shuts the provider down and unregisters the global tracer, context manager and propagator. */
  shutdown(): Promise<void>;
}

/**
 * Starts the OpenTelemetry trace SDK and registers it globally: an AsyncLocalStorage context manager, the W3C
 * trace-context propagator, and a tracer provider whose spans get `tenant.id` and `request.id` on start and pass
 * through {@link AllowlistSpanExporter} into a batch processor. Baggage is not propagated because callers can put
 * arbitrary text in it. Call once per process, before instrumentation is registered.
 */
export function startTracing(options: TracingOptions): Tracing {
  if (!isServiceName(options.serviceName)) {
    throw new RangeError(
      'serviceName must be a lower-case service name such as "api".',
    );
  }
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const exporter = new AllowlistSpanExporter(
    options.exporter ??
      new OTLPTraceExporter({
        url: options.otlpTracesUrl ?? DEFAULT_OTLP_TRACES_URL,
      }),
  );
  const tracerProvider = new TracerProvider({
    resource: resourceFromAttributes({
      "service.name": options.serviceName,
      "service.version": options.serviceVersion,
      "deployment.environment.name": options.environment,
    }),
    spanProcessors: [
      new TelemetryContextSpanProcessor(options.getContext),
      new BatchSpanProcessor({ exporter }),
    ],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  return {
    tracerProvider,
    async shutdown() {
      await tracerProvider.shutdown();
      trace.disable();
      propagation.disable();
      context.disable();
    },
  };
}
