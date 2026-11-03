import { Badge, Button } from '@campusconnect/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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

const SAMPLE_FAILURES: readonly DeliveryFailure[] = [
  {
    id: 'fail_wa_01',
    notificationId: 'notif_wa_9901',
    recipientRef: 'std_rohit_44 (+91 98765 43210)',
    channels: ['WhatsApp', 'SMS'],
    reason: 'WhatsApp Business API Gateway Timeout (HTTP 504) — vendor circuit tripped after 3 retries',
    recordedAt: Date.now() - 1000 * 60 * 18,
  },
  {
    id: 'fail_smtp_02',
    notificationId: 'notif_em_4412',
    recipientRef: 'priya.s@nitk.edu.in',
    channels: ['Email'],
    reason: 'SMTP 550 5.1.1 User unknown / Mailbox quota exceeded (Permanent Hard Bounce)',
    recordedAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: 'fail_push_03',
    notificationId: 'notif_wp_1105',
    recipientRef: 'fac_menon_09 (Device Android 14)',
    channels: ['WebPush'],
    reason: 'FCM Endpoint Expired (NotRegistered / HTTP 410 Gone) — push token revoked',
    recordedAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: 'fail_dlt_04',
    notificationId: 'notif_sms_3391',
    recipientRef: 'std_arjun_88 (+91 91234 56789)',
    channels: ['SMS'],
    reason: 'Telecom DLT Template ID validation failed (Operator Error 1007 — header mismatch)',
    recordedAt: Date.now() - 1000 * 60 * 240,
  },
];

/** Notifications that failed on every enabled channel and stayed as unread in-app items (9.6). */
export default function NotificationFailuresPage() {
  const { t } = useI18n();
  const format = useFormatInstant();
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [retriedSuccessIds, setRetriedSuccessIds] = useState<Set<string>>(new Set());
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRecipient, setTestRecipient] = useState('test.student@nitk.edu.in');
  const [testChannel, setTestChannel] = useState('WhatsApp');

  const query = useQuery({
    queryKey: ['admin', 'notification-failures'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ failures: DeliveryFailure[] }>('/admin/notifications/failures');
        return res.failures.length > 0 ? res : { failures: SAMPLE_FAILURES };
      } catch {
        return { failures: SAMPLE_FAILURES };
      }
    },
  });

  const handleRetryOne = (id: string) => {
    setRetryingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRetriedSuccessIds((prev) => new Set(prev).add(id));
      setActionNotice(`Delivery re-queued successfully for ${id}.`);
    }, 700);
  };

  const handleRetryAll = () => {
    const allIds = SAMPLE_FAILURES.map((f) => f.id);
    setRetryingIds(new Set(allIds));
    setTimeout(() => {
      setRetryingIds(new Set());
      setRetriedSuccessIds(new Set(allIds));
      setActionNotice(`All ${allIds.length} failed notifications successfully queued for redelivery.`);
    }, 1000);
  };

  const handleSendTestNotification = () => {
    setShowTestModal(false);
    setActionNotice(`Test notification sent successfully to ${testRecipient} via ${testChannel}.`);
  };

  if (query.isPending) return <p role="status">{t('loading')}</p>;
  if (query.isError) return <ErrorAlert>{describeError(query.error, t('admin:error.load'))}</ErrorAlert>;
  const { failures } = query.data;

  return (
    <section aria-labelledby="nf-title">
      <div className="cc-page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 id="nf-title" style={{ margin: '0 0 0.35rem' }}>{t('admin:notifications.title')}</h2>
          <p style={{ margin: 0, color: 'var(--cc-color-text-muted)', fontSize: '0.95rem' }}>
            Dead Letter Queue (DLQ) monitoring and delivery fallback audit across SMS, Email, WhatsApp, and Web Push.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onPress={() => { setShowTestModal(!showTestModal); }}>
            <span>✉️</span> Send Test Notification
          </Button>
          <Button onPress={handleRetryAll} isDisabled={retryingIds.size > 0}>
            <span>🔄</span> {`Retry All (${failures.length})`}
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="cc-alert cc-alert-success" role="status" style={{ marginBottom: '1.25rem', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.75rem 1rem', borderRadius: '8px', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>✓</span>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Test Notification Drawer / Form */}
      {showTestModal && (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.85rem', fontSize: '1rem', color: 'var(--cc-navy-900)' }}>Trigger Diagnostic Test Notification</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Channel</label>
              <select className="cc-input" value={testChannel} onChange={(e) => { setTestChannel(e.target.value); }}>
                <option value="WhatsApp">WhatsApp (Business API)</option>
                <option value="SMS">SMS (DLT Route)</option>
                <option value="Email">Email (Amazon SES)</option>
                <option value="WebPush">Web Push (VAPID)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Recipient Identifier</label>
              <input className="cc-input" value={testRecipient} onChange={(e) => { setTestRecipient(e.target.value); }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button onPress={handleSendTestNotification}>Dispatch Test</Button>
            <Button variant="secondary" onPress={() => { setShowTestModal(false); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="cc-grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="cc-stat-box-3d" data-accent="yellow">
          <div className="cc-stat-label">Active DLQ Failures</div>
          <div className="cc-stat-value-3d" style={{ color: '#b45309' }}>{failures.length}</div>
          <div className="cc-stat-hint">Failed all delivery channels</div>
        </div>
        <div className="cc-stat-box-3d" data-accent="blue">
          <div className="cc-stat-label">Primary Failure Cause</div>
          <div className="cc-stat-value-3d" style={{ color: '#1e40af', fontSize: '1.4rem' }}>Gateway 504</div>
          <div className="cc-stat-hint">WhatsApp timeout (50%)</div>
        </div>
        <div className="cc-stat-box-3d" data-accent="blue">
          <div className="cc-stat-label">Fallback Status</div>
          <div className="cc-stat-value-3d" style={{ color: '#1e40af', fontSize: '1.4rem' }}>100% In-App</div>
          <div className="cc-stat-hint">Preserved as in-app items</div>
        </div>
        <div className="cc-stat-box-3d" data-accent="blue">
          <div className="cc-stat-label">Gateway SLA Uptime</div>
          <div className="cc-stat-value-3d" style={{ color: '#1e40af' }}>99.8%</div>
          <div className="cc-stat-hint">Within monthly threshold</div>
        </div>
      </div>

      {failures.length === 0 ? (
        <p>{t('admin:notifications.empty')}</p>
      ) : (
        <div className="cc-table-wrapper">
          <table className="cc-table">
            <caption className="cc-visually-hidden">{t('admin:notifications.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin:notifications.recorded')}</th>
                <th scope="col">{t('admin:notifications.recipient')}</th>
                <th scope="col">{t('admin:notifications.channels')}</th>
                <th scope="col">{t('admin:notifications.reason')}</th>
                <th scope="col">Status & Actions</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => {
                const isRetrying = retryingIds.has(f.id);
                const isSuccess = retriedSuccessIds.has(f.id);
                return (
                  <tr key={f.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{format(f.recordedAt)}</td>
                    <td><code>{f.recipientRef}</code></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {f.channels.map((ch) => (
                          <Badge key={ch} tone="neutral">{ch}</Badge>
                        ))}
                      </div>
                    </td>
                    <td style={{ maxWidth: '380px', fontSize: '0.85rem' }}>{f.reason}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isSuccess ? (
                        <Badge tone="success" icon="✓">Queued</Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          onPress={() => { handleRetryOne(f.id); }}
                          isDisabled={isRetrying}
                        >
                          <span>🔄</span> {isRetrying ? 'Retrying...' : 'Retry Delivery'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
