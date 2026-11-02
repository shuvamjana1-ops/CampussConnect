// Framework-neutral route table for the inbox, preference and push subscription endpoints. The HTTP layer
// authenticates the request, builds the `NotificationActor` from the session and mounts these under `/notifications`.

import { ErrorCode, httpStatusOf, type FieldError } from '@campusconnect/contracts';
import type { NotificationService } from './notification.service';
import {
  NotificationNotFoundError,
  NotificationPermissionError,
  NotificationValidationError,
  type NotificationActor,
  type NotificationPrefs,
  type PushSubscriptionInput,
} from './notifications.types';

export interface NotificationRouteRequest {
  readonly actor: NotificationActor;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface NotificationRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path relative to the mount point; `:name` marks a path parameter. */
  readonly path: string;
  readonly handler: (request: NotificationRouteRequest) => Promise<{ readonly status: number; readonly body?: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(body)) throw new NotificationValidationError([{ path: '', rule: 'type', expected: 'object' }]);
  const unknown = Object.keys(body)
    .filter((k) => !allowed.includes(k))
    .map((k): FieldError => ({ path: k, rule: 'unknown_field' }));
  if (unknown.length > 0) throw new NotificationValidationError(unknown);
  return body;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;
const PREF_FIELDS = ['inApp', 'webPush', 'email', 'quietStart', 'quietEnd', 'weeklyOpportunityDigest', 'locale'] as const;

export function parsePrefs(body: unknown): NotificationPrefs {
  const b = requireRecord(body, PREF_FIELDS);
  const errors: FieldError[] = [];
  const flag = (name: 'inApp' | 'webPush' | 'email' | 'weeklyOpportunityDigest'): boolean => {
    const v = b[name];
    if (typeof v !== 'boolean') errors.push({ path: name, rule: v === undefined ? 'required' : 'type', ...(v === undefined ? {} : { expected: 'boolean' }) });
    return v === true;
  };
  const time = (name: 'quietStart' | 'quietEnd'): string | null => {
    const v = b[name];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' || !TIME.test(v)) {
      errors.push({ path: name, rule: 'format', expected: 'HH:MM' });
      return null;
    }
    return v;
  };
  const inApp = flag('inApp');
  const webPush = flag('webPush');
  const email = flag('email');
  const weeklyOpportunityDigest = flag('weeklyOpportunityDigest');
  const quietStart = time('quietStart');
  const quietEnd = time('quietEnd');
  if ((quietStart === null) !== (quietEnd === null)) {
    errors.push({ path: quietStart === null ? 'quietStart' : 'quietEnd', rule: 'required' });
  }
  const locale = b['locale'];
  if (locale !== 'en' && locale !== 'hi') errors.push({ path: 'locale', rule: 'enum', allowed: ['en', 'hi'] });
  if (errors.length > 0) throw new NotificationValidationError(errors);
  return { inApp, webPush, email, quietStart, quietEnd, weeklyOpportunityDigest, locale: locale as 'en' | 'hi' };
}

const MAX_ENDPOINT = 2048;
const MAX_KEY = 512;

export function parseSubscription(body: unknown): PushSubscriptionInput {
  const b = requireRecord(body, ['endpoint', 'keys']);
  const errors: FieldError[] = [];
  const endpoint = b['endpoint'];
  if (typeof endpoint !== 'string' || endpoint.length < 1 || endpoint.length > MAX_ENDPOINT || !endpoint.startsWith('https://')) {
    errors.push({ path: 'endpoint', rule: 'format', expected: 'https url' });
  }
  const keys = b['keys'];
  let p256dh = '';
  let auth = '';
  if (!isRecord(keys)) {
    errors.push({ path: 'keys', rule: keys === undefined ? 'required' : 'type', ...(keys === undefined ? {} : { expected: 'object' }) });
  } else {
    for (const name of ['p256dh', 'auth'] as const) {
      const v = keys[name];
      if (typeof v !== 'string' || v.length < 1 || v.length > MAX_KEY) {
        errors.push({ path: `keys.${name}`, rule: 'length', min: 1, max: MAX_KEY });
      }
    }
    p256dh = typeof keys['p256dh'] === 'string' ? keys['p256dh'] : '';
    auth = typeof keys['auth'] === 'string' ? keys['auth'] : '';
  }
  if (errors.length > 0) throw new NotificationValidationError(errors);
  return { endpoint: endpoint as string, keys: { p256dh, auth } };
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

export function notificationRoutes(service: NotificationService): readonly NotificationRoute[] {
  return [
    {
      method: 'GET',
      path: '/inbox',
      handler: async (r) => {
        const limit = parseLimit(r.query['limit']);
        const before = r.query['before'];
        const page = await service.listInbox(r.actor, {
          ...(limit === undefined ? {} : { limit }),
          ...(before === undefined ? {} : { before }),
          unreadOnly: r.query['unread'] === 'true',
        });
        return { status: 200, body: page };
      },
    },
    {
      method: 'POST',
      path: '/inbox/read-all',
      handler: async (r) => {
        await service.markAllRead(r.actor);
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/inbox/:id/read',
      handler: async (r) => {
        await service.markRead(r.actor, r.params['id'] ?? '');
        return { status: 204 };
      },
    },
    { method: 'GET', path: '/prefs', handler: async (r) => ({ status: 200, body: await service.getPrefs(r.actor) }) },
    {
      method: 'PUT',
      path: '/prefs',
      handler: async (r) => ({ status: 200, body: await service.updatePrefs(r.actor, parsePrefs(r.body)) }),
    },
    {
      method: 'POST',
      path: '/push-subscriptions',
      handler: async (r) => {
        await service.addPushSubscription(r.actor, parseSubscription(r.body));
        return { status: 204 };
      },
    },
    {
      method: 'DELETE',
      path: '/push-subscriptions',
      handler: async (r) => {
        const b = requireRecord(r.body, ['endpoint']);
        if (typeof b['endpoint'] !== 'string' || b['endpoint'].length < 1 || b['endpoint'].length > MAX_ENDPOINT) {
          throw new NotificationValidationError([{ path: 'endpoint', rule: 'length', min: 1, max: MAX_ENDPOINT }]);
        }
        await service.removePushSubscription(r.actor, b['endpoint']);
        return { status: 204 };
      },
    },
    { method: 'GET', path: '/failures', handler: async (r) => ({ status: 200, body: await service.listFailures(r.actor) }) },
  ];
}

export interface NotificationErrorMapping {
  readonly code:
    | typeof ErrorCode.VALIDATION_FAILED
    | typeof ErrorCode.INSUFFICIENT_PERMISSION
    | typeof ErrorCode.ACCESS_DENIED;
  readonly status: number;
  readonly fields?: readonly FieldError[];
}

/** Maps a notification error to its error code and HTTP status, or `undefined` for errors that are not ours. */
export function toNotificationProblem(error: unknown): NotificationErrorMapping | undefined {
  if (error instanceof NotificationValidationError) {
    return { code: ErrorCode.VALIDATION_FAILED, status: httpStatusOf(ErrorCode.VALIDATION_FAILED), fields: error.fields };
  }
  if (error instanceof NotificationPermissionError) {
    return { code: ErrorCode.INSUFFICIENT_PERMISSION, status: httpStatusOf(ErrorCode.INSUFFICIENT_PERMISSION) };
  }
  if (error instanceof NotificationNotFoundError) {
    return { code: ErrorCode.ACCESS_DENIED, status: httpStatusOf(ErrorCode.ACCESS_DENIED) };
  }
  return undefined;
}
