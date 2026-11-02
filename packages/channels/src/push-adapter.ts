// Web Push channel using the `web-push` library with VAPID keys loaded from Secrets Manager.

import { describeError, failure, isRetryableStatus, type ChannelAdapter, type ChannelAddress, type RenderedMessage, type PushSubscriptionRecord, type SendResult } from './types.js';

export interface VapidKeys {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

/** Port implemented over `webpush.sendNotification(subscription, payload, { vapidDetails, TTL })`. */
export interface WebPushPort {
  sendNotification(
    subscription: PushSubscriptionRecord,
    payload: string,
    options: { vapidDetails: VapidKeys; TTL: number },
  ): Promise<{ statusCode: number }>;
}

/** Port implemented over Secrets Manager `GetSecretValue`; returns the secret string. */
export interface SecretsPort {
  getSecretString(secretId: string): Promise<string>;
}

/** Reads `{ subject, publicKey, privateKey }` JSON from a secret. */
export async function loadVapidKeys(secrets: SecretsPort, secretId: string): Promise<VapidKeys> {
  const parsed: unknown = JSON.parse(await secrets.getSecretString(secretId));
  const v = parsed as Partial<Record<keyof VapidKeys, unknown>>;
  if (typeof v.subject !== 'string' || typeof v.publicKey !== 'string' || typeof v.privateKey !== 'string') {
    throw new Error('VAPID secret must contain subject, publicKey and privateKey');
  }
  return { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey };
}

const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Payload carries only a title, the Ticket reference (in the title/body) and the deep link. */
export function buildPushPayload(message: RenderedMessage): string {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    deepLink: message.deepLink ?? null,
    notificationId: message.notificationId,
  });
}

export class WebPushAdapter implements ChannelAdapter {
  readonly channel = 'web_push' as const;

  constructor(
    private readonly push: WebPushPort,
    private readonly keys: VapidKeys,
  ) {}

  async send(message: RenderedMessage, address: ChannelAddress): Promise<SendResult> {
    const subscription = address.pushSubscription;
    if (!subscription) return failure(false, 'No push subscription');
    try {
      await this.push.sendNotification(subscription, buildPushPayload(message), {
        vapidDetails: this.keys,
        TTL: PUSH_TTL_SECONDS,
      });
      return { ok: true };
    } catch (err) {
      const e = describeError(err);
      // 404 and 410 mean the subscription is gone; retrying cannot help.
      return failure(isRetryableStatus(e.status), `${e.status ?? e.name}: ${e.message}`);
    }
  }
}
