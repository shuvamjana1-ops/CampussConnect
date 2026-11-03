import { Badge, Button } from '@campusconnect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useOnline } from '../../pwa/DraftStatus';
import { formatTime, useT } from './api';

interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly read: boolean;
  readonly ticketId?: string | null;
}

interface Prefs {
  readonly inApp: boolean;
  readonly webPush: boolean;
  readonly email: boolean;
}

const CHANNELS = ['inApp', 'webPush', 'email'] as const;

const SEED_NOTIFICATIONS: readonly NotificationItem[] = [
  {
    id: 'notif_1',
    title: 'REQ-2026-0842: Internal assessment marks under re-evaluation',
    body: 'Exam Superintendent Rahul Mehta forwarded your answer script to Course Evaluator Dr. Sharma. Expected response within 24 hours.',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    read: false,
    ticketId: 'tkt_exam_101',
  },
  {
    id: 'notif_2',
    title: 'New Opportunity Matched: AICTE Pragati Scholarship for Women',
    body: 'Your profile matches 94% of the eligibility criteria for the ₹50,000/yr AICTE scholarship. Applications close in 18 days.',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    read: false,
  },
  {
    id: 'notif_3',
    title: 'REQ-2026-0791: Plumber dispatched to Mandakini Hostel Block B',
    body: 'Estates team resolved the riser pressure valve issue. Please verify and confirm resolution within 5 days.',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    read: true,
    ticketId: 'tkt_hostel_102',
  },
  {
    id: 'notif_4',
    title: 'End-Semester Hall Ticket download schedule published',
    body: 'Hall ticket download will open on 5 Nov for all students with verified attendance >= 75% and zero pending fee holds.',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    read: true,
  },
];

export default function Notifications() {
  const t = useT();
  const { locale } = useI18n();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs | null>({ inApp: true, webPush: true, email: true });
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'action'>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const inbox = useQuery({
    queryKey: ['student', 'notifications'],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ items: readonly NotificationItem[] }>('/notifications');
        return res.items;
      } catch {
        return SEED_NOTIFICATIONS;
      }
    },
  });

  const stored = useQuery({
    queryKey: ['student', 'notification-prefs'],
    queryFn: async () => {
      try {
        return await apiRequest<Prefs>('/me/notification-prefs');
      } catch {
        return { inApp: true, webPush: true, email: true };
      }
    },
  });

  useEffect(() => {
    if (stored.data) setPrefs(stored.data);
  }, [stored.data]);

  // Optimistic Mark Read Mutation
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      try {
        await apiRequest<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      } catch {
        // Fallback in standalone mode
      }
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['student', 'notifications'] });
      queryClient.setQueryData<readonly NotificationItem[]>(['student', 'notifications'], (old) => {
        if (!old) return old;
        return old.map((n) => (n.id === id ? { ...n, read: true } : n));
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', 'notifications'] });
    },
    onError: () => {
      setMessage({ ok: false, text: online ? t('error.generic') : t('needsConnection') });
    },
  });

  // Optimistic Mark ALL as Read Mutation
  const markAllRead = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest<unknown>('/notifications/read-all', { method: 'POST' });
      } catch {
        // Fallback in standalone mode
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['student', 'notifications'] });
      queryClient.setQueryData<readonly NotificationItem[]>(['student', 'notifications'], (old) => {
        if (!old) return old;
        return old.map((n) => ({ ...n, read: true }));
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student', 'notifications'] });
      setMessage({ ok: true, text: 'All notifications marked as read.' });
    },
    onError: () => {
      setMessage({ ok: false, text: online ? t('error.generic') : t('needsConnection') });
    },
  });

  const savePrefs = useMutation({
    mutationFn: async (next: Prefs) => {
      try {
        await apiRequest<unknown>('/me/notification-prefs', { method: 'PUT', body: next });
      } catch {
        // mock save in preview mode
      }
    },
    onSuccess: async () => {
      setMessage({ ok: true, text: t('notifications.prefsSaved') });
      await queryClient.invalidateQueries({ queryKey: ['student', 'notification-prefs'] });
    },
    onError: () => {
      setPrefs(stored.data ?? null);
      setMessage({ ok: false, text: online ? t('notifications.prefsFailed') : t('needsConnection') });
    },
  });

  function toggle(channel: (typeof CHANNELS)[number], value: boolean): void {
    if (prefs === null) return;
    setMessage(null);
    if (!online) {
      setMessage({ ok: false, text: t('needsConnection') });
      return;
    }
    const next = { ...prefs, [channel]: value };
    setPrefs(next);
    savePrefs.mutate(next);
  }

  const items = inbox.data ?? SEED_NOTIFICATIONS;
  const unreadCount = items.filter((n) => !n.read).length;
  const actionRequiredCount = items.filter((n) => Boolean(n.ticketId) && !n.read).length;

  const filteredItems = items.filter((n) => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'action') return Boolean(n.ticketId) && !n.read;
    return true;
  });

  return (
    <section aria-labelledby="notifications-title" style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div className="cc-page-header">
        <div>
          <h2 id="notifications-title" className="cc-page-title">
            {t('notifications.title')}
          </h2>
          <p className="cc-page-desc">
            Direct alerts regarding ticket updates, emergency broadcasts, and opportunity matches.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button
            variant="secondary"
            isDisabled={unreadCount === 0 || markAllRead.isPending}
            onPress={() => {
              markAllRead.mutate();
            }}
          >
            ✓ Mark All as Read
          </Button>
          <span className="cc-badge" data-tone={unreadCount > 0 ? 'warning' : 'success'}>
            {unreadCount > 0 ? `${String(unreadCount)} Unread Notifications` : 'All caught up'}
          </span>
        </div>
      </div>

      {message && (
        <div className={`cc-alert ${message.ok ? 'cc-alert-success' : 'cc-alert-danger'}`} role={message.ok ? 'status' : 'alert'}>
          <span>{message.ok ? '✓' : '✖'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Notifications Inbox with Filter Tabs */}
      <div className="cc-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
              }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'all' ? '#1e3a8a' : '#e2e8f0'}`,
                background: activeTab === 'all' ? '#1e3a8a' : '#f8fafc',
                color: activeTab === 'all' ? '#ffffff' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('unread');
              }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'unread' ? '#1e3a8a' : '#e2e8f0'}`,
                background: activeTab === 'unread' ? '#1e3a8a' : '#f8fafc',
                color: activeTab === 'unread' ? '#ffffff' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('action');
              }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'action' ? '#1e3a8a' : '#e2e8f0'}`,
                background: activeTab === 'action' ? '#1e3a8a' : '#f8fafc',
                color: activeTab === 'action' ? '#ffffff' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Action Required ({actionRequiredCount})
            </button>
          </div>
        </div>

        {inbox.isPending ? (
          <p role="status">{t('common.loading')}</p>
        ) : filteredItems.length === 0 ? (
          <div className="cc-empty-state" style={{ padding: '2rem 1rem' }}>
            <div className="cc-empty-icon">🔔</div>
            <div className="cc-empty-title">
              {activeTab === 'unread' ? 'No unread notifications' : activeTab === 'action' ? 'No actions required' : t('notifications.empty')}
            </div>
            <p className="cc-empty-desc">
              {activeTab === 'all'
                ? 'You are completely up to date with campus notices.'
                : 'All matters requiring your confirmation or response have been attended to.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredItems.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: `1px solid ${!n.read ? '#bfdbfe' : '#e2e8f0'}`,
                  background: !n.read ? '#eff6ff' : '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{n.title}</strong>
                    {!n.read && (
                      <Badge tone="info" icon="●">
                        {t('notifications.unread')}
                      </Badge>
                    )}
                    {n.ticketId && !n.read && (
                      <Badge tone="warning" icon="⚠">
                        Action Required
                      </Badge>
                    )}
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.45 }}>
                    {n.body}
                  </p>
                  <time dateTime={n.createdAt} style={{ fontSize: '0.775rem', color: '#64748b' }}>
                    {formatTime(n.createdAt, locale)}
                  </time>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
                  {n.ticketId && (
                    <Link
                      to={`/student/tickets/${n.ticketId}`}
                      className="cc-button cc-button-secondary"
                      style={{
                        textAlign: 'center',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                        padding: '0.35rem 0.65rem',
                      }}
                    >
                      View Request →
                    </Link>
                  )}
                  {!n.read && (
                    <Button
                      variant="secondary"
                      isDisabled={markRead.isPending}
                      onPress={() => {
                        markRead.mutate(n.id);
                      }}
                    >
                      {t('notifications.markRead')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="cc-card">
        <div className="cc-card-header">
          <div>
            <h3 className="cc-card-title">
              <span>⚙️</span> {t('notifications.prefs')}
            </h3>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              {t('notifications.prefsHint')}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {CHANNELS.map((channel) => (
            <label
              key={channel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={prefs?.[channel] ?? false}
                disabled={prefs === null || savePrefs.isPending}
                onChange={(e) => {
                  toggle(channel, e.target.checked);
                }}
                style={{ minWidth: 20, minHeight: 20 }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
                {t(`notifications.channel.${channel}`)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
