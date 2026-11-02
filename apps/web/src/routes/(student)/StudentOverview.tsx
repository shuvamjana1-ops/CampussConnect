import { StatusLabel } from '@campusconnect/ui';
import { Link } from 'react-router';
import { useSession } from '../../auth/session';
import { useOpportunities } from './opportunities-data';
import { useTicketList } from './tickets-data';

export default function StudentOverview() {
  const { session } = useSession();
  const ticketList = useTicketList();
  const opportunities = useOpportunities();

  const tickets = ticketList.data?.data ?? [];
  const activeTickets = tickets.filter((t) => t.status !== 'closed');
  const needsActionTickets = tickets.filter(
    (t) => t.status === 'resolvedPending' || t.status === 'awaitingStudent',
  );

  const oppList = opportunities.data ?? [];
  const savedOpps = oppList.filter((o) => o.isSaved);
  const topMatches = [...oppList].sort((a, b) => b.matchScore - a.matchScore).slice(0, 2);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Welcome Banner */}
      <div
        className="cc-card"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
          color: '#ffffff',
          padding: '1.75rem',
          marginBottom: '1.5rem',
          border: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.12)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              <span>🎓</span>
              <span>2024BCSE042 · Semester 4 · CGPA 8.42</span>
            </div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.65rem', fontWeight: 700, color: '#ffffff' }}>
              Namaste, {session?.displayName ?? 'Student'}
            </h2>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', maxWidth: '600px', lineHeight: 1.5 }}>
              Track your campus requests, stay ahead of academic deadlines, and discover institutional scholarships matched to your profile.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/student/new" className="cc-button cc-button-saffron">
              <span>+</span> Raise a Request / Grievance
            </Link>
          </div>
        </div>
      </div>

      {/* Emergency / Broadcast Notice Banner */}
      <div className="cc-alert cc-alert-warning" role="region" aria-label="Campus Notice">
        <span style={{ fontSize: '1.25rem' }} aria-hidden="true">
          📢
        </span>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
            Campus Notice: End-Semester Hall Ticket & Marksheet Verification
          </strong>
          <span>
            Hall ticket cut-off is in 3 days. If you notice any discrepancy in internal marks or course credits, please submit a grievance to the Examination Cell immediately.
          </span>
        </div>
        <Link to="/student/new" className="cc-badge" data-tone="warning" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
          File Grievance →
        </Link>
      </div>

      {/* Quick Stat Cards */}
      <div className="cc-grid-4">
        <div className="cc-stat-box">
          <div className="cc-stat-label">Active Requests</div>
          <div className="cc-stat-value">{activeTickets.length}</div>
          <div className="cc-stat-hint">
            <span style={{ color: '#0d9488' }}>●</span> Tracked with committed SLA
          </div>
        </div>

        <div className="cc-stat-box" data-accent="saffron">
          <div className="cc-stat-label">Action Required</div>
          <div className="cc-stat-value" style={{ color: needsActionTickets.length > 0 ? '#b45309' : '#0f172a' }}>
            {needsActionTickets.length}
          </div>
          <div className="cc-stat-hint">
            {needsActionTickets.length > 0 ? 'Resolution awaiting your confirmation' : 'All requests up to date'}
          </div>
        </div>

        <div className="cc-stat-box" data-accent="teal">
          <div className="cc-stat-label">Matched Opportunities</div>
          <div className="cc-stat-value">{oppList.length}</div>
          <div className="cc-stat-hint">
            <span>⭐</span> {savedOpps.length} saved in your tracker
          </div>
        </div>

        <div className="cc-stat-box">
          <div className="cc-stat-label">Profile Completeness</div>
          <div className="cc-stat-value">84%</div>
          <div className="cc-stat-hint">
            <Link to="/student/profile" style={{ color: '#1e3a8a', textDecoration: 'none', fontWeight: 600 }}>
              Update profile →
            </Link>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Active Requests & Recommended Opportunities */}
      <div className="cc-grid-2">
        {/* Active Requests Card */}
        <div className="cc-card">
          <div className="cc-card-header">
            <h3 className="cc-card-title">
              <span>📋</span> Recent Requests & Grievances
            </h3>
            <Link to="/student/tickets" style={{ fontSize: '0.875rem', color: '#1e3a8a', fontWeight: 600, textDecoration: 'none' }}>
              View all ({tickets.length}) →
            </Link>
          </div>

          {activeTickets.length === 0 ? (
            <div className="cc-empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="cc-empty-icon">✓</div>
              <div className="cc-empty-title">No pending requests</div>
              <p className="cc-empty-desc">
                Everything is resolved. If you need assistance with exams, hostel, or fees, raise a request anytime.
              </p>
              <Link to="/student/new" className="cc-button">
                Raise New Request
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeTickets.slice(0, 3).map((ticket) => (
                <div
                  key={ticket.id}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{ticket.reference}</strong>
                      <span className="cc-badge" data-tone={ticket.type === 'Complaint' ? 'warning' : 'neutral'}>
                        {ticket.type === 'Complaint' ? 'Grievance' : 'Request'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ticket.categoryName ?? 'General Enquiry'} · {ticket.departmentName ?? 'Pending Triage'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem', flexShrink: 0 }}>
                    <StatusLabel status={ticket.status} />
                    <Link
                      to={`/student/tickets/${ticket.id}`}
                      style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600, textDecoration: 'none' }}
                    >
                      Track →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Opportunities Card */}
        <div className="cc-card">
          <div className="cc-card-header">
            <h3 className="cc-card-title">
              <span>🎯</span> Recommended for You
            </h3>
            <Link to="/student/opportunities" style={{ fontSize: '0.875rem', color: '#1e3a8a', fontWeight: 600, textDecoration: 'none' }}>
              Browse all ({oppList.length}) →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {topMatches.map((opp) => (
              <div
                key={opp.id}
                style={{
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className="cc-badge" data-tone="success">
                      {opp.matchScore}% Match
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      ⏳ {opp.daysRemaining} days left
                    </span>
                  </div>
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.925rem', fontWeight: 600, color: '#0f172a' }}>
                    {opp.title}
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: '#0d9488', fontWeight: 600 }}>
                    {opp.awardText}
                  </div>
                </div>
                <Link
                  to="/student/opportunities"
                  className="cc-button cc-button-secondary"
                  style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8rem', flexShrink: 0 }}
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Eligibility calculated via verified academic profile
            </span>
            <Link to="/student/opportunities" style={{ fontSize: '0.825rem', color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>
              Check required documents →
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Campus Help Strip */}
      <div
        className="cc-card"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.75rem' }}>🛡️</span>
          <div>
            <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0f172a' }}>
              Campus Emergency & Helplines (24x7)
            </strong>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Security Control: <strong>+91-11-2659-1000</strong> · Health Center: <strong>+91-11-2659-1500</strong> · Anti-Ragging & Women's Cell
            </span>
          </div>
        </div>
        <Link to="/student/help" className="cc-button cc-button-secondary">
          Campus Directory & FAQs
        </Link>
      </div>
    </div>
  );
}

