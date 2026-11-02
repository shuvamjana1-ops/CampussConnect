// Shared persistence for notifications: loading the recipient, planning channels, storing the notification and its
// deliveries, and attempting one external channel. Used by the `notify` consumer, the delivery workers and `send()`.

import { randomUUID } from 'node:crypto';
import {
  renderTemplate,
  type ChannelAddress,
  type Locale,
  type RenderedMessage,
  type SendResult,
  type TemplateEvent,
} from '@campusconnect/channels';
import { planDelivery, type Channel, type ChannelPrefs } from '@campusconnect/domain/notifications';
import {
  DEFAULT_PREFS,
  type DeliveryChannel,
  type ExternalAdapters,
  type NotificationContent,
  type NotificationPrefs,
  type NotificationSqlClient,
} from './notifications.types';

export interface RecipientContext {
  readonly userId: string;
  readonly email: string | null;
  readonly hasPushSubscription: boolean;
  readonly smsEnabled: boolean;
  readonly prefs: NotificationPrefs;
  readonly inQuietHours: boolean;
}

interface RecipientRow {
  email: string | null;
  has_push: boolean;
  sms_enabled: boolean | null;
  local_time: string | null;
  in_app: boolean | null;
  web_push: boolean | null;
  pref_email: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  digest: boolean | null;
  locale: Locale | null;
}

/** True when `local` (`HH:MM`) falls in `[start, end)`; the range may wrap midnight. Equal bounds mean no quiet hours. */
export function isWithinQuietHours(local: string, start: string | null, end: string | null): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

/** Loads the recipient's address book, preferences and the Tenant's SMS setting. Undefined when the user is unknown. */
export async function loadRecipient(
  tx: NotificationSqlClient,
  tenantId: string,
  userId: string,
): Promise<RecipientContext | undefined> {
  const result = await tx.query<RecipientRow>(
    `SELECT u.email,
            EXISTS (SELECT 1 FROM notify.push_subscriptions s WHERE s.tenant_id = u.tenant_id AND s.user_id = u.id) AS has_push,
            c.sms_enabled,
            to_char(now() AT TIME ZONE COALESCE(c.time_zone, 'Asia/Kolkata'), 'HH24:MI') AS local_time,
            p.in_app, p.web_push, p.email AS pref_email,
            to_char(p.quiet_start, 'HH24:MI') AS quiet_start, to_char(p.quiet_end, 'HH24:MI') AS quiet_end,
            p.weekly_opportunity_digest AS digest, p.locale
       FROM core.users u
       LEFT JOIN notify.notification_prefs p ON p.tenant_id = u.tenant_id AND p.user_id = u.id
       LEFT JOIN core.tenant_config c ON c.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1::uuid AND u.id = $2::uuid`,
    [tenantId, userId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const prefs: NotificationPrefs = {
    inApp: row.in_app ?? DEFAULT_PREFS.inApp,
    webPush: row.web_push ?? DEFAULT_PREFS.webPush,
    email: row.pref_email ?? DEFAULT_PREFS.email,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    weeklyOpportunityDigest: row.digest ?? DEFAULT_PREFS.weeklyOpportunityDigest,
    locale: row.locale ?? DEFAULT_PREFS.locale,
  };
  return {
    userId,
    email: row.email,
    hasPushSubscription: row.has_push,
    smsEnabled: row.sms_enabled ?? false,
    prefs,
    inQuietHours: isWithinQuietHours(row.local_time ?? '00:00', prefs.quietStart, prefs.quietEnd),
  };
}

/**
 * Channel preferences for `planDelivery`. A preference only counts when the user can be reached on the channel, so a
 * Student with push switched on but no subscription is not planned on push. In-app is always addressable.
 */
export function channelPrefsOf(recipient: RecipientContext): ChannelPrefs {
  const addressed: Channel[] = ['in_app'];
  if (recipient.hasPushSubscription) addressed.push('web_push');
  if (recipient.email !== null) addressed.push('email');
  const wanted: Record<string, boolean> = {
    in_app: recipient.prefs.inApp,
    web_push: recipient.prefs.webPush,
    email: recipient.prefs.email,
  };
  return {
    addressed,
    enabled: addressed.filter((c) => wanted[c] === true),
    inQuietHours: recipient.inQuietHours,
  };
}

/** Channels the user could fall back to: addressed and enabled, or every addressed channel for an emergency. */
export function enabledChannelsOf(recipient: RecipientContext, emergency: boolean): Channel[] {
  const prefs = channelPrefsOf(recipient);
  return emergency ? [...prefs.addressed] : [...prefs.enabled];
}

export interface CreatedDelivery {
  readonly id: string;
  readonly channel: Channel;
  readonly status: 'pending' | 'sent';
}

export interface CreatedNotification {
  readonly notificationId: string;
  readonly deliveries: readonly CreatedDelivery[];
}

/**
 * Stores the notification (always, so it shows in the inbox) and one delivery row per planned channel. The in-app
 * delivery is `sent` at once because the stored row is the inbox entry. SMS deliveries belong to the emergency
 * Broadcast flow (Phase 3) and are not created here.
 */
export async function createNotification(
  tx: NotificationSqlClient,
  tenantId: string,
  recipient: RecipientContext,
  content: NotificationContent,
  emergency: boolean,
  tenant: { smsEnabled: boolean } = { smsEnabled: recipient.smsEnabled },
): Promise<CreatedNotification> {
  const notificationId = randomUUID();
  const rendered = renderTemplate(content.event as TemplateEvent, content.params as never, {
    tenantId,
    notificationId,
    recipientId: recipient.userId,
    channel: 'in_app',
  });
  await tx.query(
    `INSERT INTO notify.notifications (tenant_id, id, user_id, event, params, emergency, title, body, deep_link)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6, $7, $8, $9)`,
    [
      tenantId,
      notificationId,
      recipient.userId,
      content.event,
      JSON.stringify(content.params),
      emergency,
      rendered.title,
      rendered.body,
      rendered.deepLink ?? null,
    ],
  );

  const planned = planDelivery({ emergency }, channelPrefsOf(recipient), tenant);
  const deliveries: CreatedDelivery[] = [];
  for (const channel of planned) {
    if (channel === 'sms') continue;
    const status = channel === 'in_app' ? 'sent' : 'pending';
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO notify.notification_deliveries (tenant_id, notification_id, channel, status, attempts, next_attempt_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, CASE WHEN $4 = 'pending' THEN now() END)
       RETURNING id::text AS id`,
      [tenantId, notificationId, channel, status, status === 'sent' ? 1 : 0],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) throw new Error('Delivery insert returned no row.');
    deliveries.push({ id, channel, status });
  }
  return { notificationId, deliveries };
}

interface AttemptRow {
  user_id: string;
  event: TemplateEvent;
  params: unknown;
  email: string | null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function failed(retryable: boolean, error: string): SendResult {
  return { ok: false, retryable, error };
}

/**
 * Renders the stored notification for one external channel and sends it. Never throws for a delivery problem: a
 * render failure or guard rejection is a permanent failure, anything the adapter reports keeps its retryable flag.
 */
export async function attemptChannel(
  tx: NotificationSqlClient,
  adapters: ExternalAdapters,
  tenantId: string,
  notificationId: string,
  channel: DeliveryChannel,
): Promise<SendResult> {
  const found = await tx.query<AttemptRow>(
    `SELECT n.user_id::text AS user_id, n.event, n.params, u.email
       FROM notify.notifications n
       JOIN core.users u ON u.tenant_id = n.tenant_id AND u.id = n.user_id
      WHERE n.tenant_id = $1::uuid AND n.id = $2::uuid`,
    [tenantId, notificationId],
  );
  const row = found.rows[0];
  if (row === undefined) return failed(false, 'Notification not found');

  let message: RenderedMessage;
  try {
    message = renderTemplate(row.event, row.params as never, {
      tenantId,
      notificationId,
      recipientId: row.user_id,
      channel,
    });
  } catch (error) {
    return failed(false, error instanceof Error ? error.message : 'Render failed');
  }

  const adapter = adapters[channel];
  if (channel === 'email') {
    if (row.email === null) return failed(false, 'No email address');
    return adapter.send(message, { email: row.email });
  }

  const subscriptions = await tx.query<SubscriptionRow>(
    `SELECT id::text AS id, endpoint, p256dh, auth FROM notify.push_subscriptions
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
    [tenantId, row.user_id],
  );
  if (subscriptions.rows.length === 0) return failed(false, 'No push subscription');
  let delivered: SendResult | undefined;
  let lastFailure: SendResult = failed(false, 'No push subscription');
  for (const sub of subscriptions.rows) {
    const address: ChannelAddress = { pushSubscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } };
    const result = await adapter.send(message, address);
    if (result.ok) {
      delivered ??= result;
      continue;
    }
    // 404 and 410 mean the browser dropped the subscription; remove it so it is not tried again.
    if (!result.retryable && /^(404|410)\b/u.test(result.error)) {
      await tx.query(`DELETE FROM notify.push_subscriptions WHERE tenant_id = $1::uuid AND id = $2::uuid`, [tenantId, sub.id]);
    }
    if (!lastFailure.ok && (result.retryable || !lastFailure.retryable)) lastFailure = result;
  }
  return delivered ?? lastFailure;
}
