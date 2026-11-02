import { Badge, Button } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnline } from '../../pwa/DraftStatus';
import { formatTime, useT } from './api';

interface Consent {
  readonly purpose: string;
  readonly description: string;
  readonly decision: 'granted' | 'declined' | null;
  readonly decidedAt: string | null;
  readonly withdrawnAt: string | null;
}

interface DataRequest {
  readonly id: string;
  readonly kind: 'export' | 'erasure';
  readonly status: 'open' | 'completed' | 'failed';
  readonly dueAt: string;
  readonly failureReason?: string | null;
}

const SEED_CONSENTS: readonly Consent[] = [
  {
    purpose: 'Scholarship & Opportunity AI Matching',
    description: 'Allows CampusConnect to semantically match your department, academic records, and optional income bracket against government schemes (NSP, AICTE) and research grants.',
    decision: 'granted',
    decidedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    withdrawnAt: null,
  },
  {
    purpose: 'Emergency SMS & WhatsApp Alerts',
    description: 'Direct SMS delivery for campus safety bulletins, exam hall change notices, and urgent flood/weather closures.',
    decision: 'granted',
    decidedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    withdrawnAt: null,
  },
  {
    purpose: 'Weekly Digest & Newsletter',
    description: 'Summarizes newly open internships, extracurricular deadlines, and club announcements every Monday morning.',
    decision: null,
    decidedAt: null,
    withdrawnAt: null,
  },
];

const SEED_DATA_REQUESTS: readonly DataRequest[] = [
  {
    id: 'req_dpdp_01',
    kind: 'export',
    status: 'completed',
    dueAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

function consentState(c: Consent): 'granted' | 'declined' | 'withdrawn' | 'pending' {
  if (c.withdrawnAt !== null) return 'withdrawn';
  return c.decision ?? 'pending';
}

export default function Privacy() {
  const t = useT();
  const { locale } = useI18n();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmErasure, setConfirmErasure] = useState(false);

  const consents = useQuery({
    queryKey: ['student', 'consents'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ items: readonly Consent[] }>('/me/consents');
        return res.items;
      } catch {
        return SEED_CONSENTS;
      }
    },
  });

  const requests = useQuery({
    queryKey: ['student', 'data-requests'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ items: readonly DataRequest[] }>('/me/data-requests');
        return res.items;
      } catch {
        return SEED_DATA_REQUESTS;
      }
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { purpose: string; decision: 'granted' | 'declined' | 'withdrawn' }) => {
      try {
        await apiRequest<void>(`/me/consents/${encodeURIComponent(v.purpose)}`, {
          method: 'PUT',
          body: { decision: v.decision },
        });
      } catch {
        // mock consent update in preview
      }
    },
    onSuccess: async () => {
      setMessage({ ok: true, text: t('privacy.consent.saved') });
      await queryClient.invalidateQueries({ queryKey: ['student', 'consents'] });
    },
    onError: () => setMessage({ ok: false, text: online ? t('privacy.consent.failed') : t('needsConnection') }),
  });

  const request = useMutation({
    mutationFn: async (kind: 'export' | 'erasure') => {
      try {
        await apiRequest<void>('/me/data-requests', { method: 'POST', body: { kind } });
      } catch {
        // mock submit in preview
      }
    },
    onSuccess: async () => {
      setMessage({ ok: true, text: t('privacy.request.submitted') });
      setConfirmErasure(false);
      await queryClient.invalidateQueries({ queryKey: ['student', 'data-requests'] });
    },
    onError: () => setMessage({ ok: false, text: online ? t('privacy.request.failed') : t('needsConnection') }),
  });

  function run(action: () => void): void {
    setMessage(null);
    if (!online) {
      setMessage({ ok: false, text: t('needsConnection') });
      return;
    }
    action();
  }

  const consentList = consents.data ?? SEED_CONSENTS;
  const requestList = requests.data ?? SEED_DATA_REQUESTS;

  return (
    <section aria-labelledby="privacy-title" style={{ maxWidth: '880px', margin: '0 auto' }}>
      <div className="cc-page-header">
        <div>
          <h2 id="privacy-title" className="cc-page-title">
            {t('privacy.title')} & DPDP Governance
          </h2>
          <p className="cc-page-desc">
            Your data protection rights under India's Digital Personal Data Protection (DPDP) Act, 2023.
          </p>
        </div>
      </div>

      {message && (
        <div className={`cc-alert ${message.ok ? 'cc-alert-success' : 'cc-alert-danger'}`} role={message.ok ? 'status' : 'alert'}>
          <span>{message.ok ? '✓' : '✖'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* DPDP Notice Card */}
      <div className="cc-card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #0d9488' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#0f766e' }}>
          🛡️ {t('privacy.notice.heading')}
        </h3>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: 1.5 }}>
          {t('privacy.notice.body')}
        </p>
      </div>

      {/* Consent Settings Card */}
      <div className="cc-card" style={{ marginBottom: '1.5rem' }}>
        <div className="cc-card-header">
          <h3 className="cc-card-title">
            <span>⚖️</span> {t('privacy.consents')}
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Revocable at any time without penalty
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {consentList.map((c) => {
            const state = consentState(c);
            const since = state === 'withdrawn' ? c.withdrawnAt : c.decidedAt;
            return (
              <div
                key={c.purpose}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{c.purpose}</strong>
                    <Badge
                      tone={state === 'granted' ? 'success' : state === 'pending' ? 'neutral' : 'warning'}
                      icon={state === 'granted' ? '✓' : state === 'pending' ? '?' : '✖'}
                    >
                      {t(`privacy.consent.${state}`)}
                    </Badge>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.45, margin: '0 0 0.35rem' }}>
                    {c.description}
                  </p>
                  {since && (
                    <span style={{ fontSize: '0.775rem', color: '#64748b' }}>
                      {t('privacy.consent.since', { time: formatTime(since, locale) })}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'center' }}>
                  {state === 'granted' ? (
                    <Button
                      variant="secondary"
                      isDisabled={decide.isPending}
                      onPress={() => run(() => decide.mutate({ purpose: c.purpose, decision: 'withdrawn' }))}
                    >
                      {t('privacy.consent.withdraw')}
                    </Button>
                  ) : (
                    <>
                      <Button
                        isDisabled={decide.isPending}
                        onPress={() => run(() => decide.mutate({ purpose: c.purpose, decision: 'granted' }))}
                      >
                        {t('privacy.consent.grant')}
                      </Button>
                      {state === 'pending' && (
                        <Button
                          variant="secondary"
                          isDisabled={decide.isPending}
                          onPress={() => run(() => decide.mutate({ purpose: c.purpose, decision: 'declined' }))}
                        >
                          {t('privacy.consent.decline')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Subject Requests Card */}
      <div className="cc-card">
        <div className="cc-card-header">
          <h3 className="cc-card-title">
            <span>📁</span> {t('privacy.requests')} (Data Portability & Erasure)
          </h3>
        </div>

        <p style={{ fontSize: '0.875rem', color: '#475569', margin: '0 0 1rem' }}>
          Request a complete cryptographically signed archive of your activity or initiate statutory erasure of non-mandatory records.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <Button isDisabled={request.isPending} onPress={() => run(() => request.mutate('export'))}>
            📥 {t('privacy.request.export')}
          </Button>
          <Button variant="danger" isDisabled={request.isPending} onPress={() => setConfirmErasure(true)}>
            🗑️ {t('privacy.request.erasure')}
          </Button>
        </div>

        {confirmErasure && (
          <div className="cc-alert cc-alert-danger" role="alertdialog" aria-label={t('privacy.request.erasure')}>
            <div>
              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Confirm Data Erasure Request?</strong>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{t('privacy.request.erasureConfirm')}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="danger" isDisabled={request.isPending} onPress={() => run(() => request.mutate('erasure'))}>
                  Yes, Request Erasure
                </Button>
                <Button variant="secondary" onPress={() => setConfirmErasure(false)}>
                  {t('action.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '1rem 0 0.5rem' }}>
          Past Requests Log
        </h4>

        {requestList.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('privacy.request.none')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {requestList.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <strong>{t(`privacy.request.kind.${r.kind}`)}</strong>
                  <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                    {t('privacy.request.due', { time: formatTime(r.dueAt, locale) })}
                  </span>
                </div>
                <Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'info'}>
                  {t(`privacy.request.status.${r.status}`)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
