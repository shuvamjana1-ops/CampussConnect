// Notification_Service public interface: `send()` for callers with their own retry policy, the inbox, preferences,
// push subscriptions and the Tenant_Admin failure report (requirements 9.1, 9.2, 9.4, 9.5, 9.6, 9.8).

import type { Locale, TemplateEvent } from '@campusconnect/channels';
import { createNotification, attemptChannel, loadRecipient } from './notification-store';
import {
  DEFAULT_PREFS,
  NotificationNotFoundError,
  NotificationPermissionError,
  NotificationValidationError,
  isDeliveryChannel,
  type ChannelOutcome,
  type ExternalAdapters,
  type InboxItem,
  type InboxPage,
  type NotificationActor,
  type NotificationDatabase,
  type NotificationFailureRow,
  type NotificationPrefs,
  type PushSubscriptionInput,
  type SendNotificationInput,
  type SendOutcome,
} from './notifications.types';

export const INBOX_DEFAULT_LIMIT = 20;
export const INBOX_MAX_LIMIT = 100;
const FAILURE_REPORT_LIMIT = 200;

export interface NotificationServiceOptions {
  readonly database: NotificationDatabase;
  readonly adapters: ExternalAdapters;
}

interface InboxRow {
  id: string;
  event: TemplateEvent;
  title: string;
  body: string;
  deep_link: string | null;
  emergency: boolean;
  read: boolean;
  created_ms: string | number;
  expires_ms: string | number;
  cursor: string;
}

interface PrefsRow {
  in_app: boolean;
  web_push: boolean;
  email: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  weekly_opportunity_digest: boolean;
  locale: Locale;
}

const PREFS_SELECT = `in_app, web_push, email, to_char(quiet_start, 'HH24:MI') AS quiet_start,
  to_char(quiet_end, 'HH24:MI') AS quiet_end, weekly_opportunity_digest, locale`;

function toPrefs(row: PrefsRow): NotificationPrefs {
  return {
    inApp: row.in_app,
    webPush: row.web_push,
    email: row.email,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    weeklyOpportunityDigest: row.weekly_opportunity_digest,
    locale: row.locale,
  };
}

export class NotificationService {
  private readonly database: NotificationDatabase;
  private readonly adapters: ExternalAdapters;

  constructor(options: NotificationServiceOptions) {
    this.database = options.database;
    this.adapters = options.adapters;
  }

  /**
   * Stores the notification and attempts each planned channel once, returning what happened on each. It does not
   * retry or fall back: the caller applies its own policy (for example 3 retries at 30 seconds for P0 escalation, 5.7).
   * The notification stays in the recipient's inbox whatever the outcome.
   */
  async send(input: SendNotificationInput): Promise<SendOutcome> {
    const emergency = input.emergency ?? false;
    return this.database.transaction({ tenantId: input.tenantId }, async (tx) => {
      const recipient = await loadRecipient(tx, input.tenantId, input.recipientId);
      if (recipient === undefined) {
        throw new NotificationValidationError([{ path: 'recipientId', rule: 'tenant_member' }]);
      }
      const created = await createNotification(tx, input.tenantId, recipient, input.content, emergency);
      const channels: ChannelOutcome[] = [];
      for (const delivery of created.deliveries) {
        if (delivery.status === 'sent' || !isDeliveryChannel(delivery.channel)) {
          channels.push({ channel: delivery.channel, status: 'sent' });
          continue;
        }
        const result = await attemptChannel(tx, this.adapters, input.tenantId, created.notificationId, delivery.channel);
        const sent = result.ok;
        await tx.query(
          `UPDATE notify.notification_deliveries
              SET status = $3, attempts = 1, last_error_code = $4, next_attempt_at = NULL, updated_at = now()
            WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [input.tenantId, delivery.id, sent ? 'sent' : 'failed', result.ok ? null : result.error.slice(0, 200)],
        );
        channels.push(
          result.ok
            ? { channel: delivery.channel, status: 'sent' }
            : { channel: delivery.channel, status: 'failed', error: result.error, retryable: result.retryable },
        );
      }
      return {
        notificationId: created.notificationId,
        channels,
        delivered: channels.some((c) => c.status === 'sent'),
      };
    });
  }

  /** The user's own unexpired notifications, newest first (9.8). `before` is the `nextCursor` of the previous page. */
  async listInbox(
    actor: NotificationActor,
    options: { readonly limit?: number; readonly before?: string; readonly unreadOnly?: boolean } = {},
  ): Promise<InboxPage> {
    const limit = options.limit ?? INBOX_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > INBOX_MAX_LIMIT) {
      throw new NotificationValidationError([{ path: 'limit', rule: 'range', min: 1, max: INBOX_MAX_LIMIT }]);
    }
    const cursor = options.before === undefined ? undefined : parseCursor(options.before);
    return this.database.transaction(actor, async (tx) => {
      const rows = await tx.query<InboxRow>(
        `SELECT id::text AS id, event, title, body, deep_link, emergency, (read_at IS NOT NULL) AS read,
                (extract(epoch FROM created_at) * 1000)::bigint AS created_ms,
                (extract(epoch FROM expires_at) * 1000)::bigint AS expires_ms,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || id::text AS cursor
           FROM notify.notifications
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND expires_at > now()
            AND ($3::boolean IS NOT TRUE OR read_at IS NULL)
            AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
          ORDER BY created_at DESC, id DESC
          LIMIT $6`,
        [actor.tenantId, actor.userId, options.unreadOnly ?? false, cursor?.at ?? null, cursor?.id ?? null, limit + 1],
      );
      const unread = await tx.query<{ count: string | number }>(
        `SELECT count(*) AS count FROM notify.notifications
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND expires_at > now() AND read_at IS NULL`,
        [actor.tenantId, actor.userId],
      );
      const page = rows.rows.slice(0, limit);
      const last = page[page.length - 1];
      const items: InboxItem[] = page.map((r) => ({
        id: r.id,
        event: r.event,
        title: r.title,
        body: r.body,
        deepLink: r.deep_link,
        emergency: r.emergency,
        read: r.read,
        createdAt: Number(r.created_ms),
        expiresAt: Number(r.expires_ms),
      }));
      return {
        items,
        unreadCount: Number(unread.rows[0]?.count ?? 0),
        nextCursor: rows.rows.length > limit && last !== undefined ? last.cursor : null,
      };
    });
  }

  /** Marks one of the user's notifications read. Idempotent. */
  async markRead(actor: NotificationActor, notificationId: string): Promise<void> {
    assertUuid('id', notificationId);
    await this.database.transaction(actor, async (tx) => {
      const result = await tx.query(
        `UPDATE notify.notifications SET read_at = COALESCE(read_at, now())
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND id = $3::uuid AND expires_at > now()
          RETURNING 1`,
        [actor.tenantId, actor.userId, notificationId],
      );
      if (result.rows.length === 0) throw new NotificationNotFoundError();
    });
  }

  async markAllRead(actor: NotificationActor): Promise<void> {
    await this.database.transaction(actor, async (tx) => {
      await tx.query(
        `UPDATE notify.notifications SET read_at = now()
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND read_at IS NULL`,
        [actor.tenantId, actor.userId],
      );
    });
  }

  async getPrefs(actor: NotificationActor): Promise<NotificationPrefs> {
    return this.database.transaction(actor, async (tx) => {
      const result = await tx.query<PrefsRow>(
        `SELECT ${PREFS_SELECT} FROM notify.notification_prefs WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [actor.tenantId, actor.userId],
      );
      const row = result.rows[0];
      return row === undefined ? DEFAULT_PREFS : toPrefs(row);
    });
  }

  /** Replaces the user's preferences (9.4). Emergency notifications ignore them (9.3). */
  async updatePrefs(actor: NotificationActor, prefs: NotificationPrefs): Promise<NotificationPrefs> {
    return this.database.transaction(actor, async (tx) => {
      const result = await tx.query<PrefsRow>(
        `INSERT INTO notify.notification_prefs
           (tenant_id, user_id, in_app, web_push, email, quiet_start, quiet_end, weekly_opportunity_digest, locale)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::time, $7::time, $8, $9)
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET in_app = EXCLUDED.in_app, web_push = EXCLUDED.web_push, email = EXCLUDED.email,
               quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end,
               weekly_opportunity_digest = EXCLUDED.weekly_opportunity_digest, locale = EXCLUDED.locale,
               updated_at = now()
         RETURNING ${PREFS_SELECT}`,
        [
          actor.tenantId,
          actor.userId,
          prefs.inApp,
          prefs.webPush,
          prefs.email,
          prefs.quietStart,
          prefs.quietEnd,
          prefs.weeklyOpportunityDigest,
          prefs.locale,
        ],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error('Preference upsert returned no row.');
      return toPrefs(row);
    });
  }

  /** Registers a browser push subscription for the user. Registering the same endpoint again replaces its keys. */
  async addPushSubscription(actor: NotificationActor, subscription: PushSubscriptionInput): Promise<void> {
    await this.database.transaction(actor, async (tx) => {
      await tx.query(
        `INSERT INTO notify.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)
         ON CONFLICT (tenant_id, user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [actor.tenantId, actor.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
      );
    });
  }

  async removePushSubscription(actor: NotificationActor, endpoint: string): Promise<void> {
    await this.database.transaction(actor, async (tx) => {
      await tx.query(
        `DELETE FROM notify.push_subscriptions WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND endpoint = $3`,
        [actor.tenantId, actor.userId, endpoint],
      );
    });
  }

  /** Notifications that no channel delivered, newest first (9.6). Tenant_Admin only. */
  async listFailures(actor: NotificationActor): Promise<readonly NotificationFailureRow[]> {
    if (!actor.roles.includes('tenant_admin')) throw new NotificationPermissionError();
    return this.database.transaction(actor, async (tx) => {
      const result = await tx.query<{
        notification_id: string;
        user_id: string;
        event: TemplateEvent;
        failed_channels: string[];
        at_ms: string | number;
      }>(
        `SELECT f.notification_id::text AS notification_id, n.user_id::text AS user_id, n.event, f.failed_channels,
                (extract(epoch FROM f.at) * 1000)::bigint AS at_ms
           FROM notify.notification_failures f
           JOIN notify.notifications n ON n.tenant_id = f.tenant_id AND n.id = f.notification_id
          WHERE f.tenant_id = $1::uuid
          ORDER BY f.at DESC
          LIMIT ${FAILURE_REPORT_LIMIT}`,
        [actor.tenantId],
      );
      return result.rows.map((r) => ({
        notificationId: r.notification_id,
        userId: r.user_id,
        event: r.event,
        failedChannels: r.failed_channels,
        at: Number(r.at_ms),
      }));
    });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f-]{36})$/iu;

function assertUuid(path: string, value: string): void {
  if (!UUID.test(value)) throw new NotificationValidationError([{ path, rule: 'format', expected: 'uuid' }]);
}

function parseCursor(value: string): { at: string; id: string } {
  const match = CURSOR.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || !UUID.test(match[2])) {
    throw new NotificationValidationError([{ path: 'before', rule: 'format', expected: 'cursor' }]);
  }
  return { at: match[1], id: match[2] };
}
