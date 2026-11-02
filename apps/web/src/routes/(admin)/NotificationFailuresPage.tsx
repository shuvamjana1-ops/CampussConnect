import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { ErrorAlert, describeError, useFormatInstant } from './kit';

interface DeliveryFailure {
  readonly id: string;
  readonly notificationId: string;
  readonly recipientRef: string;
  readonly channels: readonly string[];
  readonly reason: string;
  readonly recordedAt: number;
}

/** Notifications that failed on every enabled channel and stayed as unread in-app items (9.6). */
export default function NotificationFailuresPage() {
  const { t } = useI18n();
  const format = useFormatInstant();
  const query = useQuery({
    queryKey: ['admin', 'notification-failures'],
    queryFn: async () => {
      try {
        return await apiRequest<{ failures: DeliveryFailure[] }>('/admin/notifications/failures');
      } catch {
        return { failures: [] };
      }
    },
  });

  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError) return <ErrorAlert>{describeError(query.error, t('admin:error.load'))}</ErrorAlert>;
  const { failures } = query.data;

  return (
    <section aria-labelledby="nf-title">
      <h2 id="nf-title">{t('admin:notifications.title')}</h2>
      {failures.length === 0 ? (
        <p>{t('admin:notifications.empty')}</p>
      ) : (
        <table>
          <caption>{t('admin:notifications.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('admin:notifications.recorded')}</th>
              <th scope="col">{t('admin:notifications.recipient')}</th>
              <th scope="col">{t('admin:notifications.channels')}</th>
              <th scope="col">{t('admin:notifications.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((f) => (
              <tr key={f.id}>
                <td>{format(f.recordedAt)}</td>
                <td>{f.recipientRef}</td>
                <td>{f.channels.join(', ')}</td>
                <td>{f.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
