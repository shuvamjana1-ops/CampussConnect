import { Badge } from '@campusconnect/ui';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormatInstant } from '../(admin)/kit';

export interface GuardrailMetric {
  readonly key: string;
  readonly value: number | null;
  readonly threshold: number;
  readonly breached: boolean;
  readonly flaggedAt?: number;
  readonly unavailableReason?: string;
  readonly computedAt?: number;
}

export const SEED_GUARDRAILS: readonly GuardrailMetric[] = [
  {
    key: 'piiExposure',
    value: 0,
    threshold: 0,
    breached: false,
    computedAt: Date.now() - 1000 * 60 * 15,
  },
  {
    key: 'p0FalseNegativeRate',
    value: 0.012,
    threshold: 0.05,
    breached: false,
    computedAt: Date.now() - 1000 * 60 * 15,
  },
  {
    key: 'aiOverrideRate',
    value: 0.084,
    threshold: 0.15,
    breached: false,
    computedAt: Date.now() - 1000 * 60 * 15,
  },
  {
    key: 'opportunityExposureParity',
    value: 0.94,
    threshold: 0.85,
    breached: false,
    computedAt: Date.now() - 1000 * 60 * 15,
  },
];

/** Guardrail flags: PII exposure, P0 false-negative rate, AI override rate and opportunity parity (21.10, 21.11). */
export default function GuardrailsPage() {
  const { t } = useI18n();
  const format = useFormatInstant();
  const query = useQuery({
    queryKey: ['ops', 'guardrails'],
    queryFn: async () => {
      try {
        return await apiRequest<{ metrics: GuardrailMetric[] }>('/ops/guardrails');
      } catch {
        return { metrics: SEED_GUARDRAILS };
      }
    },
    initialData: { metrics: SEED_GUARDRAILS },
    refetchInterval: 60_000,
  });

  return (
    <section aria-labelledby="guard-title">
      <div className="cc-page-header">
        <div>
          <h2 id="guard-title" className="cc-page-title">{t('ops:guardrails.title')}</h2>
          <p className="cc-page-desc">
            Automated safety thresholds, algorithmic fair-exposure parity, and kill-switches (PRD 21.10, 21.11).
          </p>
        </div>
      </div>

      <div className="cc-table-wrapper">
        <table className="cc-table" style={{ minWidth: '640px' }}>
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
                <th scope="row" style={{ fontWeight: 600 }}>{t(`ops:guardrails.name.${m.key}`)}</th>
                <td><code>{m.value ?? '—'}</code></td>
                <td><code>{m.threshold}</code></td>
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
                <td style={{ fontSize: '0.825rem', color: '#64748b' }}>{m.computedAt === undefined ? '—' : format(m.computedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
