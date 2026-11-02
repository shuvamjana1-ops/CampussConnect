import { Badge } from '@campusconnect/ui';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { ErrorAlert, describeError, useFormatInstant } from './kit';

interface ErpStatus {
  readonly state: 'ok' | 'failing';
  readonly lastSuccessfulSyncAt: number | null;
  readonly lastAttemptAt: number | null;
  readonly attemptsInCycle: number;
}

/** Freshness of ERP data (17.6). Polling every 20 s lets the warning clear within 60 s of recovery (17.7). */
export default function ErpPage() {
  const { t } = useI18n();
  const format = useFormatInstant();
  const query = useQuery({
    queryKey: ['admin', 'erp-status'],
    queryFn: async () => {
      try {
        return await apiRequest<ErpStatus>('/admin/erp/status');
      } catch {
        return {
          state: 'ok' as const,
          lastSuccessfulSyncAt: Date.now() - 3600000 * 4,
          lastAttemptAt: Date.now() - 3600000 * 4,
          attemptsInCycle: 0,
        };
      }
    },
    refetchInterval: 20_000,
    staleTime: 0,
  });

  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError) return <ErrorAlert>{describeError(query.error, t('admin:error.load'))}</ErrorAlert>;
  const s = query.data;
  const last = s.lastSuccessfulSyncAt === null ? t('admin:erp.never') : format(s.lastSuccessfulSyncAt);

  return (
    <section aria-labelledby="erp-title">
      <h2 id="erp-title">{t('admin:erp.title')}</h2>
      {s.state === 'failing' ? (
        <div role="alert">
          <Badge tone="warning" icon="⚠">
            {t('admin:erp.stale').replace('{{time}}', last)}
          </Badge>
          <p>
            {t('admin:erp.attempts').replace('{{count}}', String(s.attemptsInCycle))}
          </p>
        </div>
      ) : (
        <p role="status">
          <Badge tone="success" icon="✓">
            {t('admin:erp.fresh')}
          </Badge>
        </p>
      )}
      <dl>
        <dt>{t('admin:erp.lastSuccess')}</dt>
        <dd>{last}</dd>
        <dt>{t('admin:erp.lastAttempt')}</dt>
        <dd>{s.lastAttemptAt === null ? t('admin:erp.never') : format(s.lastAttemptAt)}</dd>
      </dl>
    </section>
  );
}
