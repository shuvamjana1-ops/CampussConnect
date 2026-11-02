// In-app channel: the inbox is a Postgres table (`notify.notifications`, retained 30 days, requirement 9.8).
// The store is a port implemented in packages/server/notifications so this package has no database driver.

import { describeError, failure, type ChannelAdapter, type ChannelAddress, type RenderedMessage, type SendResult } from './types.js';

/** Inbox retention (requirement 9.8). */
export const INBOX_RETENTION_DAYS = 30;

export interface InboxStore {
  /**
   * Makes the rendered message visible in the recipient's inbox, idempotent on `notificationId`.
   * The row expires `INBOX_RETENTION_DAYS` after creation and stays unread until the user opens it.
   */
  put(message: RenderedMessage): Promise<void>;
}

export class InAppAdapter implements ChannelAdapter {
  readonly channel = 'in_app' as const;

  constructor(private readonly inbox: InboxStore) {}

  async send(message: RenderedMessage, _address: ChannelAddress): Promise<SendResult> {
    try {
      await this.inbox.put(message);
      return { ok: true, providerId: message.notificationId };
    } catch (err) {
      return failure(true, describeError(err).message);
    }
  }
}
