import { SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TelemetryContext } from './telemetry-context';
import { filterSpanAttributes, REDACTED_SPAN_NAME, safeSpanName, startTracing, type Tracing } from './tracing';

const TENANT = '0190a1b2-0000-7000-8000-00000000000a';
const REQUEST = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const EMAIL = 'priya.sharma@example.edu';

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error('expected exactly one item');
  }
  return item;
}

describe('startTracing', () => {
  const exporter = new InMemorySpanExporter();
  let current: TelemetryContext | undefined;
  let tracing: Tracing;

  beforeAll(() => {
    tracing = startTracing({ serviceName: 'api', getContext: () => current, exporter });
  });

  afterAll(async () => {
    await tracing.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
    current = undefined;
  });

  async function exportedSpans(): Promise<ReadableSpan[]> {
    await tracing.tracerProvider.forceFlush();
    return exporter.getFinishedSpans();
  }

  it('sets tenant.id and request.id from the request context on every span, including child spans', async () => {
    current = { tenantId: TENANT, requestId: REQUEST };
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('GET /api/v1/tickets/:id', (parent) => {
      tracer.startSpan('db.query').end();
      parent.end();
    });

    const spans = await exportedSpans();
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span.attributes).toMatchObject({ 'tenant.id': TENANT, 'request.id': REQUEST });
    }
    const parent = spans.find((span) => span.name === 'GET /api/v1/tickets/:id');
    const child = spans.find((span) => span.name === 'db.query');
    expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
  });

  it('exports only allowlisted attributes and strips PII from attributes, exception events and status', async () => {
    const span = trace.getTracer('test').startSpan('POST /api/v1/tickets', {
      attributes: {
        'http.request.method': 'POST',
        'http.route': '/api/v1/tickets',
        'http.response.status_code': 422,
        'url.full': `https://iitx.campusconnect.app/api/v1/tickets?email=${EMAIL}`,
        'enduser.id': EMAIL,
        'db.query.text': `select id from users where email = '${EMAIL}'`,
        'app.description': 'Water leaking in hostel room B-214',
      },
    });
    span.recordException(new Error(`Duplicate account for ${EMAIL}`));
    span.setStatus({ code: SpanStatusCode.ERROR, message: `No user ${EMAIL}` });
    span.end();

    const exported = only(await exportedSpans());
    expect(exported.attributes).toEqual({
      'http.request.method': 'POST',
      'http.route': '/api/v1/tickets',
      'http.response.status_code': 422,
    });
    expect(exported.droppedAttributesCount).toBeGreaterThanOrEqual(4);
    expect(exported.status).toEqual({ code: SpanStatusCode.ERROR });
    const exception = only(exported.events);
    expect(exception.name).toBe('exception');
    expect(exception.attributes).toMatchObject({ 'exception.type': 'Error' });
    expect(exception.attributes).not.toHaveProperty('exception.message');
    expect(exception.attributes).not.toHaveProperty('exception.stacktrace');

    const serialised = JSON.stringify({
      name: exported.name,
      attributes: exported.attributes,
      events: exported.events,
      status: exported.status,
    });
    for (const leaked of ['priya', 'hostel']) {
      expect(serialised).not.toContain(leaked);
    }
  });

  it('filters link attributes', async () => {
    const tracer = trace.getTracer('test');
    const producer = tracer.startSpan('sqs.send');
    producer.end();
    tracer
      .startSpan('sqs.receive', {
        links: [{ context: producer.spanContext(), attributes: { 'messaging.system': 'aws_sqs', 'enduser.id': EMAIL } }],
      })
      .end();

    const consumer = (await exportedSpans()).find((span) => span.name === 'sqs.receive');
    expect(consumer?.links.map((link) => link.attributes)).toEqual([{ 'messaging.system': 'aws_sqs' }]);
  });

  it('replaces a span name that holds a raw path', async () => {
    trace.getTracer('test').startSpan('GET /api/v1/students/2021CS1234').end();

    expect(only(await exportedSpans()).name).toBe(REDACTED_SPAN_NAME);
  });
});

describe('filterSpanAttributes', () => {
  it('keeps tenant.id, request.id and http.route only when their values are well formed', () => {
    const { attributes, removed } = filterSpanAttributes({
      'tenant.id': 'iit-x',
      'request.id': EMAIL,
      'http.route': '/api/v1/tickets?status=open',
      'server.port': 443,
    });

    expect(attributes).toEqual({ 'server.port': 443 });
    expect(removed).toBe(3);
  });

  it('drops technical attributes whose values are not plain identifiers, numbers or booleans', () => {
    const { attributes } = filterSpanAttributes({
      'server.address': 'router.huggingface.co',
      'error.type': `rejected ${EMAIL}`,
      'db.namespace': { name: 'campusconnect' },
      'messaging.batch.message_count': Number.NaN,
    });

    expect(attributes).toEqual({ 'server.address': 'router.huggingface.co' });
  });
});

describe('safeSpanName', () => {
  it('keeps span names built from identifiers and route templates', () => {
    for (const name of ['GET', 'GET /api/v1/tickets/:id', 'pg.query:SELECT campusconnect', 'triage.classify']) {
      expect(safeSpanName(name)).toBe(name);
    }
  });

  it('replaces span names that hold raw paths or free text', () => {
    for (const name of [`GET /api/v1/users/${EMAIL}`, 'GET /api/v1/tickets/01JABCDEFG', 'Complaint: water leak!']) {
      expect(safeSpanName(name)).toBe(REDACTED_SPAN_NAME);
    }
  });
});
