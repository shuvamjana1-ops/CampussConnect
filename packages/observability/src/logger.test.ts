import { describe, expect, it } from 'vitest';

import { createActorRefHasher, hkdfActorRefKeys } from './actor-ref';
import { createLogger, INVALID_EVENT, type LoggerOptions } from './logger';
import type { TelemetryContext } from './telemetry-context';

const TENANT = '0190a1b2-0000-7000-8000-00000000000a';
const REQUEST = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const USER = '0190a1b2-0000-7000-8000-000000000001';
const EMAIL = 'priya.sharma@example.edu';

/** A logger that writes into memory. `raw` keeps each line as written; `lines` holds the parsed objects. */
function capture(options: Partial<LoggerOptions> = {}) {
  const raw: string[] = [];
  const logger = createLogger({
    service: 'api',
    destination: {
      write(line: string) {
        raw.push(line);
      },
    },
    ...options,
  });
  const lines = () => raw.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, raw, lines };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error('expected exactly one item');
  }
  return item;
}

describe('createLogger', () => {
  it('writes one JSON line with level, time, service, event and the allowlisted fields', () => {
    const { logger, lines } = capture();
    const actorRef = createActorRefHasher(hkdfActorRefKeys(new Uint8Array(32).fill(1)))(TENANT, USER);

    logger.info('http.request.completed', {
      requestId: REQUEST,
      tenantId: TENANT,
      route: '/api/v1/tickets/:id',
      status: 200,
      durationMs: 12.5,
      errorCode: 'VERSION_CONFLICT',
      actorRef,
    });

    const { time, ...rest } = only(lines());
    expect(typeof time).toBe('string');
    expect(rest).toEqual({
      level: 'info',
      service: 'api',
      event: 'http.request.completed',
      requestId: REQUEST,
      tenantId: TENANT,
      route: '/api/v1/tickets/:id',
      status: 200,
      durationMs: 12.5,
      errorCode: 'VERSION_CONFLICT',
      actorRef,
    });
  });

  it('drops fields outside the allowlist and counts them without echoing their names or values', () => {
    const { logger, raw, lines } = capture();
    const fields = { requestId: REQUEST, email: EMAIL, description: 'Water leaking in hostel room B-214' };

    logger.warn('ticket.submitted', fields);

    expect(only(lines())).toMatchObject({ requestId: REQUEST, droppedFieldCount: 2 });
    const line = only(raw);
    for (const leaked of ['priya', 'email', 'description', 'hostel']) {
      expect(line).not.toContain(leaked);
    }
  });

  it('rejects invalid values for allowlisted fields and names only the fields', () => {
    const { logger, raw, lines } = capture();

    logger.error('http.request.failed', {
      route: '/api/v1/students/2021CS1234',
      status: 999,
      errorCode: 'connection reset for priya',
      requestId: EMAIL,
      durationMs: -1,
    });

    const line = only(lines());
    expect(line.invalidFields).toEqual(['route', 'status', 'errorCode', 'requestId', 'durationMs']);
    expect(line).not.toHaveProperty('status');
    for (const leaked of ['2021CS1234', 'priya']) {
      expect(only(raw)).not.toContain(leaked);
    }
  });

  it('adds the request id and Tenant id from the context provider to every line in a request', () => {
    let current: TelemetryContext | undefined = { tenantId: TENANT.toUpperCase(), requestId: REQUEST };
    const { logger, lines } = capture({ getContext: () => current });

    logger.info('ticket.created');
    current = undefined;
    logger.info('server.started');

    const [inRequest, outside] = lines();
    expect(inRequest).toMatchObject({ tenantId: TENANT, requestId: REQUEST });
    expect(outside).not.toHaveProperty('tenantId');
    expect(outside).not.toHaveProperty('requestId');
  });

  it('writes child bindings on every line and lets call fields override them', () => {
    const { logger, lines } = capture();
    const child = logger.child({ tenantId: TENANT, route: '/api/v1/tickets' });

    child.info('ticket.listed', { status: 200 });
    child.info('ticket.viewed', { route: '/api/v1/tickets/:id' });

    const [listed, viewed] = lines();
    expect(listed).toMatchObject({ tenantId: TENANT, route: '/api/v1/tickets', status: 200 });
    expect(viewed).toMatchObject({ tenantId: TENANT, route: '/api/v1/tickets/:id' });
  });

  it('replaces an event name that is not a dotted lower-case identifier', () => {
    const { logger, raw, lines } = capture();

    logger.info('Ticket created for Priya');

    expect(only(lines())).toMatchObject({ event: INVALID_EVENT });
    expect(only(raw)).not.toContain('Priya');
  });

  it('accepts only string literals as event names and only allowlisted fields in object literals', () => {
    const { logger, lines } = capture();
    const message = ['Ticket created for', EMAIL].join(' ');

    // @ts-expect-error A dynamic string cannot be an event name.
    logger.info(message);
    // @ts-expect-error A field outside the allowlist does not compile.
    logger.info('ticket.created', { email: EMAIL });

    const [dynamic, literal] = lines();
    expect(dynamic).toMatchObject({ event: INVALID_EVENT });
    expect(literal).toMatchObject({ event: 'ticket.created', droppedFieldCount: 1 });
  });

  it('writes nothing below the configured level', () => {
    const { logger, lines } = capture({ level: 'warn' });

    logger.debug('cache.miss');
    logger.info('ticket.created');
    logger.warn('sla.sweeper_lagging');

    expect(lines().map((line) => line.event)).toEqual(['sla.sweeper_lagging']);
  });

  it('rejects a service name that is not a lower-case identifier', () => {
    expect(() => createLogger({ service: 'API Server' })).toThrow(RangeError);
  });
});
