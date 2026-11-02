// ChannelAdapter contract shared by every delivery channel.

/** Same values as `Channel` in `@campusconnect/domain/notifications`. */
export type Channel = 'in_app' | 'web_push' | 'email' | 'sms';

export type Locale = 'en' | 'hi';

export const LOCALES: readonly Locale[] = ['en', 'hi'];

/** A message after template rendering. Only the fields a channel uses are set. */
export interface RenderedMessage {
  readonly channel: Channel;
  readonly locale: Locale;
  readonly tenantId: string;
  readonly notificationId: string;
  readonly recipientId: string;
  /** Email subject, push title or inbox title. Unused for SMS. */
  readonly title: string;
  /** Plain-text body. */
  readonly body: string;
  /** Optional HTML body (email only). */
  readonly html?: string;
  /** Link opened from the message. */
  readonly deepLink?: string;
  /** DLT template variables (SMS only), in template slot order. */
  readonly smsVariables?: readonly string[];
  /** Tenant DLT template id (SMS only). */
  readonly smsTemplateId?: string;
}

/** Where a message goes. Which fields are required depends on the channel. */
export interface ChannelAddress {
  readonly email?: string;
  readonly phoneE164?: string;
  readonly pushSubscription?: PushSubscriptionRecord;
}

export interface PushSubscriptionRecord {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

export type SendResult =
  | { readonly ok: true; readonly providerId?: string }
  | { readonly ok: false; readonly retryable: boolean; readonly error: string };

export interface ChannelAdapter {
  readonly channel: Channel;
  send(message: RenderedMessage, address: ChannelAddress): Promise<SendResult>;
}

export function failure(retryable: boolean, error: string): SendResult {
  return { ok: false, retryable, error };
}

/** Reads the `name`, `$metadata.httpStatusCode` and `statusCode` fields that AWS and web-push errors carry. */
export function describeError(err: unknown): { name: string; status: number | undefined; message: string } {
  if (typeof err !== 'object' || err === null) return { name: 'Error', status: undefined, message: String(err) };
  const e = err as { name?: unknown; message?: unknown; statusCode?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const statusRaw = e.statusCode ?? e.$metadata?.httpStatusCode;
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    status: typeof statusRaw === 'number' ? statusRaw : undefined,
    message: typeof e.message === 'string' ? e.message : 'Unknown error',
  };
}

/** 4xx other than 408 and 429 is permanent; everything else (5xx, throttling, network) can be retried. */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 408 || status === 429) return true;
  return !(status >= 400 && status < 500);
}
