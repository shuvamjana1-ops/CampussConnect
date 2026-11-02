// Types for the Notification_Service (requirements 9.1, 9.2, 9.4, 9.5, 9.6, 9.8).

import type {
  ChannelAdapter,
  Locale,
  PushSubscriptionRecord,
  TemplateEvent,
  TemplateParamsByEvent,
} from '@campusconnect/channels';
import type { FieldError } from '@campusconnect/contracts';
import type { Channel } from '@campusconnect/domain/notifications';

export type { Channel };

/** Minimal SQL surface the notification module needs. Compatible with the outbox, audit and Ticket clients. */
export interface NotificationSqlClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** The Tenant (and, for user endpoints, the user) a transaction runs for. Sets the values row-level security reads. */
export interface NotificationScope {
  readonly tenantId: string;
  readonly userId?: string;
  readonly roles?: readonly string[];
}

export interface NotificationDatabase {
  transaction<T>(scope: NotificationScope, fn: (tx: NotificationSqlClient) => Promise<T>): Promise<T>;
}

/** The user an endpoint acts for, as resolved by the guards. */
export interface NotificationActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: readonly string[];
}

/** A queue publisher that can delay a message. SQS `DelaySeconds` allows 0 to 900. */
export interface DelayedQueuePublisher {
  send(queue: string, body: string, delaySeconds?: number): Promise<void>;
}

/** Queues the delivery workers read from, one per external channel. */
export const DELIVERY_QUEUES = {
  web_push: 'deliver-push',
  email: 'deliver-email',
} as const;

export type DeliveryChannel = keyof typeof DELIVERY_QUEUES;

export function isDeliveryChannel(channel: Channel): channel is DeliveryChannel {
  return channel === 'web_push' || channel === 'email';
}

/** Body of a `deliver-push` or `deliver-email` message. `attempt` is the 1-based attempt this message performs. */
export interface DeliveryMessage {
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly attempt: number;
}

/** What a caller supplies: the template event and the parameters it accepts. */
export type NotificationContent = {
  [E in TemplateEvent]: { readonly event: E; readonly params: TemplateParamsByEvent[E] };
}[TemplateEvent];

export interface SendNotificationInput {
  readonly tenantId: string;
  readonly recipientId: string;
  readonly content: NotificationContent;
  /** Emergency alerts go to every addressed channel and ignore preferences and quiet hours (9.3, 13.5). */
  readonly emergency?: boolean;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface ChannelOutcome {
  readonly channel: Channel;
  readonly status: DeliveryStatus;
  /** Set when the channel failed. */
  readonly error?: string;
  /** True when a retry could succeed. */
  readonly retryable?: boolean;
}

/** Result of `NotificationService.send()`. The notification is stored in the inbox whatever the outcome. */
export interface SendOutcome {
  readonly notificationId: string;
  readonly channels: readonly ChannelOutcome[];
  /** True when at least one planned channel delivered. */
  readonly delivered: boolean;
}

export interface InboxItem {
  readonly id: string;
  readonly event: TemplateEvent;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string | null;
  readonly emergency: boolean;
  readonly read: boolean;
  /** UTC milliseconds. */
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface InboxPage {
  readonly items: readonly InboxItem[];
  readonly unreadCount: number;
  /** Pass as `before` for the next page; null on the last page. */
  readonly nextCursor: string | null;
}

export interface NotificationPrefs {
  readonly inApp: boolean;
  readonly webPush: boolean;
  readonly email: boolean;
  /** `HH:MM` in the Tenant's time zone, or null when no quiet hours are set. */
  readonly quietStart: string | null;
  readonly quietEnd: string | null;
  readonly weeklyOpportunityDigest: boolean;
  readonly locale: Locale;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  inApp: true,
  webPush: true,
  email: true,
  quietStart: null,
  quietEnd: null,
  weeklyOpportunityDigest: false,
  locale: 'en',
};

export type PushSubscriptionInput = PushSubscriptionRecord;

export interface NotificationFailureRow {
  readonly notificationId: string;
  readonly userId: string;
  readonly event: TemplateEvent;
  readonly failedChannels: readonly string[];
  readonly at: number;
}

/** Adapters the delivery code sends through. In-app needs none: the stored notification is the inbox entry. */
export type ExternalAdapters = Readonly<Record<DeliveryChannel, ChannelAdapter>>;

/** Thrown when a request body is out of bounds. Maps to `422 VALIDATION_FAILED`. */
export class NotificationValidationError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly fields: readonly FieldError[]) {
    super('Notification values are invalid.');
    this.name = 'NotificationValidationError';
  }
}

/** Thrown when the actor lacks the role an endpoint needs. Maps to `403 INSUFFICIENT_PERMISSION`. */
export class NotificationPermissionError extends Error {
  readonly code = 'INSUFFICIENT_PERMISSION' as const;

  constructor() {
    super('The role does not allow this action.');
    this.name = 'NotificationPermissionError';
  }
}

/** Thrown when the notification does not exist for this user. Maps to `403 ACCESS_DENIED`, so existence is not revealed. */
export class NotificationNotFoundError extends Error {
  readonly code = 'ACCESS_DENIED' as const;

  constructor() {
    super('Notification not found.');
    this.name = 'NotificationNotFoundError';
  }
}
