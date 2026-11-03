import { Button, StatusLabel, TextField } from '@campusconnect/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatTime, useT } from './api';
import { useTicketList } from './tickets-data';

export default function TicketList() {
  const t = useT();
  const { locale, t: tr } = useI18n();
  const query = useTicketList();

  const [activeFilter, setActiveFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  if (query.isPending) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p role="status">{t('common.loading')}</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="cc-alert cc-alert-danger" role="alert">
        <span>✖</span>
        <span>{t('common.loadFailed')}</span>
      </div>
    );
  }

  const { data: tickets, offlineAsOf } = query.data;

  const filteredTickets = tickets.filter((ticket) => {
    if (activeFilter === 'open' && (ticket.status === 'closed' || ticket.status === 'resolvedPending')) {
      return false;
    }
    if (activeFilter === 'pending' && ticket.status !== 'resolvedPending') {
      return false;
    }
    if (activeFilter === 'closed' && ticket.status !== 'closed') {
      return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchRef = ticket.reference.toLowerCase().includes(q);
      const matchCat = (ticket.categoryName ?? '').toLowerCase().includes(q);
      const matchDept = (ticket.departmentName ?? '').toLowerCase().includes(q);
      return matchRef || matchCat || matchDept;
    }

    return true;
  });

  return (
    <section aria-labelledby="list-title">
      <div className="cc-page-header">
        <div>
          <h2 id="list-title" className="cc-page-title">
            {t('list.title')}
          </h2>
          <p className="cc-page-desc">
            Track submitted campus requests, verify department resolutions, and manage confidential grievances.
          </p>
        </div>
        <Link to="/student/new" className="cc-button cc-button-saffron">
          + Raise New Request
        </Link>
      </div>

      {offlineAsOf !== null && (
        <div className="cc-alert cc-alert-info" role="status">
          <span>ℹ</span>
          <span>{t('offline.banner', { time: formatTime(offlineAsOf, locale) })}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="cc-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant={activeFilter === 'all' ? 'primary' : 'secondary'}
              onPress={() => setActiveFilter('all')}
            >
              All ({tickets.length})
            </Button>
            <Button
              variant={activeFilter === 'open' ? 'primary' : 'secondary'}
              onPress={() => setActiveFilter('open')}
            >
              In Progress ({tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolvedPending').length})
            </Button>
            <Button
              variant={activeFilter === 'pending' ? 'primary' : 'secondary'}
              onPress={() => setActiveFilter('pending')}
            >
              Needs Confirmation ({tickets.filter((t) => t.status === 'resolvedPending').length})
            </Button>
            <Button
              variant={activeFilter === 'closed' ? 'primary' : 'secondary'}
              onPress={() => setActiveFilter('closed')}
            >
              Closed ({tickets.filter((t) => t.status === 'closed').length})
            </Button>
          </div>

          <div style={{ width: '280px' }}>
            <TextField
              label="Search requests"
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </div>
        </div>
      </div>

      {/* Ticket List View */}
      {filteredTickets.length === 0 ? (
        <div className="cc-empty-state">
          <div className="cc-empty-icon">📂</div>
          <div className="cc-empty-title">{t('list.empty')}</div>
          <p className="cc-empty-desc">
            You do not have any requests matching your current filter.
          </p>
          <Link to="/student/new" className="cc-button">
            Raise a Request or Grievance
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }} className="cc-perspective-container">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="cc-card-3d"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1.25rem',
              }}
            >
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <Link
                    to={`/student/tickets/${ticket.id}`}
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#1e3a8a',
                      textDecoration: 'none',
                    }}
                  >
                    {ticket.reference}
                  </Link>
                  <span className="cc-badge" data-tone={ticket.type === 'Complaint' ? 'warning' : 'neutral'}>
                    {ticket.type === 'Complaint' ? 'Grievance' : 'Request'}
                  </span>
                  <StatusLabel
                    status={ticket.status}
                    label={tr(`tickets:status.${ticket.status}`)}
                  />
                </div>

                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
                  {ticket.categoryName ?? 'General Campus Query'}
                </div>

                <div style={{ fontSize: '0.825rem', color: '#64748b', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <span>
                    🏛️ <strong>{ticket.departmentName ?? t('list.unassigned')}</strong>
                  </span>
                  {ticket.firstResponseDueAt && (
                    <span>
                      First response: <strong>{formatTime(ticket.firstResponseDueAt, locale)}</strong>
                    </span>
                  )}
                  {ticket.resolutionDueAt && (
                    <span>
                      Resolution SLA: <strong>{formatTime(ticket.resolutionDueAt, locale)}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {ticket.status === 'resolvedPending' && (
                  <span className="cc-badge" data-tone="success">
                    Confirmation Pending
                  </span>
                )}
                <Link
                  to={`/student/tickets/${ticket.id}`}
                  className="cc-button cc-button-secondary"
                  style={{ minHeight: '38px', padding: '0.25rem 0.85rem', fontSize: '0.85rem' }}
                >
                  Track & Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
