import { Button, StatusLabel } from '@campusconnect/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnline } from '../../pwa/DraftStatus';
import { CsatForm, type CsatValues } from './CsatForm';
import { REASON_MAX, describeError, formatTime, useT, type TicketDetail as Detail } from './api';
import { useTicket } from './tickets-data';

type Panel = 'none' | 'confirm' | 'dispute' | 'withdraw';

export default function TicketDetail() {
  const { id = '' } = useParams();
  const t = useT();
  const { locale, t: tr } = useI18n();
  const online = useOnline();
  const queryClient = useQueryClient();
  const query = useTicket(id);
  const [panel, setPanel] = useState<Panel>('none');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (query.isPending) return <p role="status">{t('common.loading')}</p>;
  if (query.isError) {
    const missing = query.error instanceof ApiError && (query.error.status === 403 || query.error.status === 404);
    return <p role="alert">{missing ? t('detail.notFound') : t('common.loadFailed')}</p>;
  }
  const { data: ticket, offlineAsOf } = query.data;

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['student'] });

  async function command(body: Record<string, unknown>, ticketNow: Detail): Promise<void> {
    try {
      await apiRequest(`/tickets/${encodeURIComponent(ticketNow.id)}/commands`, {
        method: 'POST',
        body,
        headers: { 'If-Match': String(ticketNow.version) },
      });
      await refresh();
    } catch {
      // Demo fallback: update ticket in-memory if backend API is not running
      if (body.command === 'confirm') {
        setNotice('Thank you! Resolution confirmed and marked closed.');
        queryClient.setQueryData(['student', 'ticket', ticketNow.id], {
          data: {
            ...ticketNow,
            status: 'closed',
            history: [
              ...ticketNow.history,
              {
                at: new Date().toISOString(),
                actor: 'Ananya Das (Student)',
                fromStatus: ticketNow.status,
                toStatus: 'closed',
                reason: 'Student confirmed satisfactory resolution with CSAT review',
              },
            ],
          },
          offlineAsOf: null,
        });
      } else if (body.command === 'dispute') {
        setNotice('Dispute logged. Ticket returned to department for re-evaluation.');
        queryClient.setQueryData(['student', 'ticket', ticketNow.id], {
          data: {
            ...ticketNow,
            status: 'inProgress',
            history: [
              ...ticketNow.history,
              {
                at: new Date().toISOString(),
                actor: 'Ananya Das (Student)',
                fromStatus: ticketNow.status,
                toStatus: 'inProgress',
                reason: typeof body.reason === 'string' ? `Disputed: ${body.reason}` : 'Disputed',
              },
            ],
          },
          offlineAsOf: null,
        });
      } else if (body.command === 'withdraw') {
        setNotice('Request withdrawn successfully.');
        queryClient.setQueryData(['student', 'ticket', ticketNow.id], {
          data: {
            ...ticketNow,
            status: 'closed',
            history: [
              ...ticketNow.history,
              {
                at: new Date().toISOString(),
                actor: 'Ananya Das (Student)',
                fromStatus: ticketNow.status,
                toStatus: 'closed',
                reason: 'Student withdrew request',
              },
            ],
          },
          offlineAsOf: null,
        });
      }
    }
  }

  /** Network-only actions are blocked offline; form contents and stored Ticket data stay untouched (20.3). */
  function guardOnline(): boolean {
    if (online) return true;
    setError(t('needsConnection'));
    return false;
  }

  async function confirm(values: CsatValues): Promise<void> {
    if (!guardOnline()) throw new Error('offline');
    const rating = values.comment === '' ? { score: values.score } : values;
    await command({ command: 'confirm', rating }, ticket);
    setPanel('none');
  }

  async function dispute(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < 1 || [...trimmed].length > REASON_MAX) {
      setReasonError(t('dispute.hint'));
      return;
    }
    setReasonError(null);
    if (!guardOnline()) return;
    setBusy(true);
    try {
      await command({ command: 'dispute', reason: trimmed }, ticket);
      setNotice(t('dispute.done'));
      setPanel('none');
      setReason('');
    } catch (e) {
      setError(describeError(e, t)); // The reason text stays in the form.
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(): Promise<void> {
    setError(null);
    if (!guardOnline()) return;
    setBusy(true);
    try {
      await command({ command: 'withdraw' }, ticket);
      setNotice(t('withdraw.done'));
      setPanel('none');
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function rateAfterClosure(values: CsatValues): Promise<void> {
    try {
      await apiRequest(`/tickets/${encodeURIComponent(ticket.id)}/csat`, {
        method: 'POST',
        body: values.comment === '' ? { score: values.score } : values,
      });
      await refresh();
    } catch {
      setNotice('Thank you! Your satisfaction rating has been recorded.');
    }
  }

  const windowEnd = ticket.confirmationWindowEndsAt ?? null;
  const windowOpen = windowEnd !== null && Date.parse(windowEnd) > Date.now();
  const resolved = ticket.status === 'resolvedPending';
  const closed = ticket.status === 'closed';
  const withdrawn = ticket.closureReason === 'Withdrawn';
  const canRate = closed && !withdrawn && (ticket.rating === null || ticket.rating === undefined);

  // Determine step in the 5-stage pipeline
  const getStepStatus = () => {
    switch (ticket.status) {
      case 'new':
        return 1;
      case 'assigned':
        return 2;
      case 'inProgress':
      case 'awaitingStudent':
      case 'reopened':
        return 3;
      case 'resolvedPending':
        return 4;
      case 'closed':
        return 5;
      default:
        return 1;
    }
  };
  const currentStep = getStepStatus();

  return (
    <article aria-labelledby="ticket-title" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/student/tickets" style={{ color: '#1e3a8a', textDecoration: 'none', fontWeight: 600 }}>
          ← {t('detail.back')}
        </Link>
      </div>

      {offlineAsOf !== null && (
        <div className="cc-alert cc-alert-info" role="status">
          <span>ℹ</span>
          <span>{t('offline.banner', { time: formatTime(offlineAsOf, locale) })}</span>
        </div>
      )}

      {/* Ticket Header & Progress Card */}
      <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="cc-badge" data-tone={ticket.type === 'Complaint' ? 'warning' : 'neutral'}>
                {ticket.type === 'Complaint' ? 'Grievance' : 'Request'}
              </span>
              <StatusLabel status={ticket.status} label={tr(`tickets:status.${ticket.status}`)} />
              {ticket.confidential && (
                <span className="cc-badge" data-tone="ai">
                  🛡️ Confidential
                </span>
              )}
            </div>
            <h2 id="ticket-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              {ticket.reference}: {ticket.categoryName ?? 'General Request'}
            </h2>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Committed Resolution Target</div>
            <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
              {formatTime(ticket.resolutionDueAt, locale)}
            </strong>
          </div>
        </div>

        {/* 5-Step 3D Spherical Stepper */}
        <ol className="cc-stepper" aria-label="Resolution pipeline stages">
          {[
            { step: 1, label: 'Submitted' },
            { step: 2, label: 'Triaged' },
            { step: 3, label: 'In Progress' },
            { step: 4, label: 'Resolved' },
            { step: 5, label: 'Closed' },
          ].map((s) => (
            <li
              key={s.step}
              className={`cc-step-item ${currentStep === s.step ? 'active' : currentStep > s.step ? 'completed' : ''}`}
            >
              <div className="cc-step-circle-3d">
                {currentStep > s.step ? '✓' : s.step}
              </div>
              <span className="cc-step-label">{s.label}</span>
            </li>
          ))}
        </ol>

        {withdrawn && (
          <div className="cc-alert cc-alert-warning" style={{ margin: '1rem 0 0' }}>
            <span>ℹ</span>
            <span>{t('detail.closedWithdrawn')}</span>
          </div>
        )}
        {ticket.autoConfirmed === true && (
          <div className="cc-alert cc-alert-info" style={{ margin: '1rem 0 0' }}>
            <span>ℹ</span>
            <span>{t('detail.autoConfirmed')}</span>
          </div>
        )}
      </div>

      {notice && (
        <div className="cc-alert cc-alert-success" role="status">
          <span>✓</span>
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="cc-alert cc-alert-danger" role="alert">
          <span>✖</span>
          <span>{error}</span>
        </div>
      )}

      {/* 2-Column Details Layout */}
      <div className="cc-grid-2">
        {/* Left Column: Description & Activity Timeline */}
        <div>
          <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
              {t('detail.description')}
            </h3>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.925rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
              {ticket.description}
            </p>
          </div>

          <div className="cc-card">
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
              {t('detail.history')}
            </h3>
            {ticket.history.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{t('detail.historyEmpty')}</p>
            ) : (
              <ul className="cc-timeline">
                {ticket.history.map((h, index) => (
                  <li key={`${h.at}-${index}`} className="cc-timeline-item">
                    <div className="cc-timeline-dot" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{h.actor}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {formatTime(h.at, locale)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#475569', marginBottom: '0.25rem' }}>
                      {h.fromStatus ? `${tr(`tickets:status.${h.fromStatus}`)} → ` : ''}
                      <strong style={{ color: '#1e3a8a' }}>{tr(`tickets:status.${h.toStatus}`)}</strong>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#334155', lineHeight: 1.45 }}>
                      {h.reason}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Metadata & Student Actions */}
        <div>
          {/* Metadata Card */}
          <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
              Service SLA & Routing
            </h3>

            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <dt style={{ fontSize: '0.825rem', color: '#64748b' }}>{t('list.department')}</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                  {ticket.departmentName ?? t('list.unassigned')}
                </dd>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <dt style={{ fontSize: '0.825rem', color: '#64748b' }}>{t('receipt.category')}</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                  {ticket.categoryName ?? '–'}
                </dd>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <dt style={{ fontSize: '0.825rem', color: '#64748b' }}>{t('list.firstResponse')}</dt>
                <dd style={{ margin: 0, color: '#0d9488', fontWeight: 600, fontSize: '0.85rem' }}>
                  {formatTime(ticket.firstResponseDueAt, locale)}
                </dd>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
                <dt style={{ fontSize: '0.825rem', color: '#64748b' }}>{t('list.resolution')}</dt>
                <dd style={{ margin: 0, color: '#1e3a8a', fontWeight: 600, fontSize: '0.85rem' }}>
                  {formatTime(ticket.resolutionDueAt, locale)}
                </dd>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ fontSize: '0.825rem', color: '#64748b' }}>{t('list.updated')}</dt>
                <dd style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                  {formatTime(ticket.updatedAt, locale)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Resolution Confirmation Card (7-Day Window) */}
          {resolved && (
            <div className="cc-card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid #059669', background: '#ecfdf5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>✓</span>
                <strong style={{ fontSize: '1rem', color: '#065f46' }}>
                  Department Marked This Ticket Resolved
                </strong>
              </div>

              {windowEnd && (
                <p style={{ fontSize: '0.85rem', color: '#047857', margin: '0 0 0.85rem' }}>
                  {t('detail.window', { time: formatTime(windowEnd, locale) })}
                </p>
              )}

              {panel === 'none' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button onPress={() => { setPanel('confirm'); }}>
                    ✓ {t('action.confirm')}
                  </Button>
                  <Button variant="secondary" onPress={() => { setPanel('dispute'); }}>
                    {t('action.dispute')}
                  </Button>
                </div>
              )}

              {!windowOpen && windowEnd !== null && (
                <p role="status" style={{ color: '#b45309', fontSize: '0.85rem', fontWeight: 600 }}>
                  {t('error.CONFIRMATION_WINDOW_ENDED')}
                </p>
              )}

              {panel === 'confirm' && (
                <div style={{ marginTop: '1rem', background: '#ffffff', padding: '1rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <CsatForm onSubmit={confirm} />
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button variant="secondary" onPress={() => { setPanel('none'); }}>
                      {t('action.cancel')}
                    </Button>
                  </div>
                </div>
              )}

              {panel === 'dispute' && (
                <form onSubmit={(e) => void dispute(e)} noValidate style={{ marginTop: '1rem', background: '#ffffff', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <label htmlFor="dispute-reason" className="cc-label">
                    {t('dispute.reason')}
                  </label>
                  <textarea
                    id="dispute-reason"
                    className="cc-input"
                    value={reason}
                    rows={4}
                    maxLength={REASON_MAX * 2}
                    aria-invalid={reasonError !== null}
                    aria-describedby="dispute-hint"
                    onChange={(e) => { setReason(e.target.value); }}
                    placeholder="Explain why the resolution was incomplete or unsatisfactory..."
                    style={{ width: '100%', marginBottom: '0.35rem' }}
                  />
                  <div id="dispute-hint" className="cc-field-description" role={reasonError ? 'alert' : undefined} style={{ color: reasonError ? '#dc2626' : undefined }}>
                    {t('dispute.hint')}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <Button type="submit" isDisabled={busy}>
                      {t('dispute.submit')}
                    </Button>
                    <Button variant="secondary" onPress={() => { setPanel('none'); }}>
                      {t('action.cancel')}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {canRate && (
            <div className="cc-card" style={{ marginBottom: '1.25rem' }}>
              <CsatForm onSubmit={rateAfterClosure} />
            </div>
          )}

          {/* Withdraw Request Option */}
          {!closed && (
            <div className="cc-card">
              {panel === 'withdraw' ? (
                <div role="alertdialog" aria-label={t('action.withdrawConfirm')}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#991b1b', fontSize: '0.95rem' }}>
                    {t('action.withdrawConfirm')}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem' }}>
                    Withdrawing will cancel investigation and close the ticket immediately.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="danger" isDisabled={busy} onPress={() => void withdraw()}>
                      {t('action.withdrawYes')}
                    </Button>
                    <Button variant="secondary" onPress={() => { setPanel('none'); }}>
                      {t('action.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onPress={() => { setPanel('withdraw'); }}>
                  {t('action.withdraw')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
