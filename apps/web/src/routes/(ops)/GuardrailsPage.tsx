import { Badge } from '@campusconnect/ui';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { ErrorAlert, describeError, useFormatInstant } from '../(admin)/kit';

interface GuardrailMetric {
  readonly key: string;
  readonly value: number | null;
  readonly threshold: number;
  readonly breached: boolean;
  readonly flaggedAt?: number;
  readonly unavailableReason?: string;
  readonly computedAt?: number;
}

/** Guardrail flags: PII exposure, P0 false-negative rate, AI override rate and opportunity parity (21.10, 21.11). */
export default function GuardrailsPage() {
  const { t } = useI18n();
  const format = useFormatInstant();
  const query = useQuery({
    queryKey: ['ops', 'guardrails'],
    queryFn: () => apiRequest<{ metrics: GuardrailMetric[] }>('/ops/guardrails'),
    refetchInterval: 60_000,
  });

  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError) return <ErrorAlert>{describeError(query.error, t('admin:error.load'))}</ErrorAlert>;

  return (
    <section aria-labelledby="guard-title">
      <h2 id="guard-title">{t('ops:guardrails.title')}</h2>
      <table>
        <caption>{t('ops:guardrails.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('ops:guardrails.metric')}</th>
            <th scope="col">{t('ops:guardrails.value')}</th>
            <th scope="col">{t('ops:guardrails.threshold')}</th>
            <th scope="col">{t('ops:guardrails.status')}</th>
            <th scope="col">{t('ops:guardrails.computedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {query.data.metrics.map((m) => (
            <tr key={m.key}>
              <th scope="row">{t(`ops:guardrails.name.${m.key}`)}</th>
              <td>{m.value === null ? '—' : m.value}</td>
              <td>{m.threshold}</td>
              <td>
                {m.unavailableReason !== undefined ? (
                  <Badge tone="neutral" icon="?">
                    {t('ops:guardrails.unavailable')}: {m.unavailableReason}
                  </Badge>
                ) : m.breached ? (
                  <Badge tone="danger" icon="⚑">
                    {t('ops:guardrails.breached')}
                    {m.flaggedAt !== undefined && ` (${format(m.flaggedAt)})`}
                  </Badge>
                ) : (
                  <Badge tone="success" icon="✓">
                    {t('ops:guardrails.ok')}
                  </Badge>
                )}
              </td>
              <td>{m.computedAt === undefined ? '—' : format(m.computedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
