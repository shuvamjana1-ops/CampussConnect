// @campusconnect/server/notifications: notification creation, channel delivery workers, inbox and preferences.

export {
  NotificationService,
  INBOX_DEFAULT_LIMIT,
  INBOX_MAX_LIMIT,
  type NotificationServiceOptions,
} from './notification.service';
export { NotifyConsumer, type NotifyConsumerOptions } from './notify.consumer';
export { DeliveryWorker } from './delivery-worker';
export { isWithinQuietHours } from './notification-store';
export {
  notificationRoutes,
  parsePrefs,
  parseSubscription,
  toNotificationProblem,
  type NotificationErrorMapping,
  type NotificationRoute,
  type NotificationRouteRequest,
} from './notifications.routes';
export * from './notifications.types';
