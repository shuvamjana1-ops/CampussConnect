import { Button, TextField } from '@campusconnect/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  useOpportunities,
  useToggleSaveOpportunity,
  type Opportunity,
  type OpportunityType,
} from './opportunities-data';

export default function Opportunities() {
  const opportunitiesQuery = useOpportunities();
  const toggleSave = useToggleSaveOpportunity();

  const [activeTab, setActiveTab] = useState<'all' | OpportunityType | 'saved'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const opps = opportunitiesQuery.data ?? [];

  const filteredOpps = opps.filter((opp) => {
    if (activeTab === 'saved') {
      if (!opp.isSaved) return false;
    } else if (activeTab !== 'all') {
      if (opp.type !== activeTab) return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = opp.title.toLowerCase().includes(q);
      const matchProvider = opp.provider.toLowerCase().includes(q);
      const matchDesc = opp.description.toLowerCase().includes(q);
      return matchTitle || matchProvider || matchDesc;
    }

    return true;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div className="cc-page-header">
        <div>
          <h2 className="cc-page-title">Opportunities & Aid Discovery</h2>
          <p className="cc-page-desc">
            Scholarships, research grants, and technical internships matched to your verified university profile.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/student/profile" className="cc-button cc-button-secondary">
            <span>⚙️</span> Match Preferences
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="cc-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant={activeTab === 'all' ? 'primary' : 'secondary'}
              onPress={() => setActiveTab('all')}
            >
              All Opportunities ({opps.length})
            </Button>
            <Button
              variant={activeTab === 'Scholarship' ? 'primary' : 'secondary'}
              onPress={() => setActiveTab('Scholarship')}
            >
              Scholarships ({opps.filter((o) => o.type === 'Scholarship').length})
            </Button>
            <Button
              variant={activeTab === 'Internship' ? 'primary' : 'secondary'}
              onPress={() => setActiveTab('Internship')}
            >
              Internships ({opps.filter((o) => o.type === 'Internship').length})
            </Button>
            <Button
              variant={activeTab === 'saved' ? 'primary' : 'secondary'}
              onPress={() => setActiveTab('saved')}
            >
              Saved ({opps.filter((o) => o.isSaved).length})
            </Button>
          </div>

          {/* Search Field */}
          <div style={{ width: '280px' }}>
            <TextField
              label="Search opportunities"
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </div>
        </div>
      </div>

      {/* Opportunity Grid */}
      {filteredOpps.length === 0 ? (
        <div className="cc-empty-state">
          <div className="cc-empty-icon">🔍</div>
          <div className="cc-empty-title">No opportunities found</div>
          <p className="cc-empty-desc">
            Try adjusting your search keywords or explore all available funding programs.
          </p>
          <Button
            variant="secondary"
            onPress={() => {
              setActiveTab('all');
              setSearchTerm('');
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }} className="cc-perspective-container">
          {filteredOpps.map((opp) => (
            <div
              key={opp.id}
              className="cc-card-3d"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `5px solid ${opp.matchScore >= 90 ? '#f59e0b' : '#1e40af'}`,
              }}
            >
              <div>
                {/* Card Top: Badges & Bookmark */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span
                      className="cc-badge"
                      style={{
                        background: opp.matchScore >= 90 ? '#fef08a' : '#eff6ff',
                        color: opp.matchScore >= 90 ? '#78350f' : '#1e40af',
                        fontWeight: 700,
                        border: `1px solid ${opp.matchScore >= 90 ? '#fde047' : '#bfdbfe'}`,
                      }}
                    >
                      ★ {opp.matchScore}% Match
                    </span>
                    <span className="cc-badge" data-tone="neutral">
                      {opp.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSave.mutate(opp.id)}
                    aria-label={opp.isSaved ? 'Remove from saved' : 'Save opportunity'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.35rem',
                      padding: '4px',
                      color: opp.isSaved ? '#f59e0b' : '#cbd5e1',
                      transition: 'transform 0.15s ease',
                    }}
                    title={opp.isSaved ? 'Saved to tracker' : 'Save opportunity'}
                  >
                    {opp.isSaved ? '★' : '☆'}
                  </button>
                </div>

                {/* Title & Provider */}
                <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  {opp.title}
                </h3>
                <div style={{ fontSize: '0.825rem', color: '#64748b', marginBottom: '0.75rem' }}>
                  🏛️ {opp.provider}
                </div>

                {/* Award & Deadline Pill */}
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e40af', marginBottom: '0.2rem' }}>
                    {opp.awardText}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: opp.daysRemaining <= 10 ? '#b45309' : '#64748b', fontWeight: opp.daysRemaining <= 10 ? 700 : 400 }}>
                    ⏳ Deadline: {new Date(opp.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ({opp.daysRemaining} days left)
                  </div>
                </div>

                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.45, margin: '0 0 1rem' }}>
                  {opp.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                <Button
                  variant="secondary"
                  onPress={() => setSelectedOpp(opp)}
                >
                  Why I Match & Docs
                </Button>
                <a
                  href={opp.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="cc-button"
                  style={{ flex: 1, textDecoration: 'none', background: '#f59e0b', color: '#0f172a', fontWeight: 700, border: '1px solid #d97706' }}
                >
                  Apply Official Portal ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Match Explanation & Document Checklist Modal / Drawer */}
      {selectedOpp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedOpp(null)}
        >
          <div
            className="cc-card"
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#ffffff',
              padding: '1.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span className="cc-badge" data-tone="success">
                    ★ {selectedOpp.matchScore}% Match Score
                  </span>
                  <span className="cc-badge" data-tone="neutral">
                    {selectedOpp.type}
                  </span>
                </div>
                <h3 id="dialog-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  {selectedOpp.title}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Provided by {selectedOpp.provider}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOpp(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Why You Match Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e3a8a', marginBottom: '0.65rem' }}>
                🎯 Match Criteria Evaluation
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem' }}>
                CampusConnect automatically evaluated your ERP profile against the official scheme guidelines:
              </p>

              <div className="cc-table-wrapper">
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Eligibility Criterion</th>
                      <th>Your Verified Profile</th>
                      <th>Scheme Requirement</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOpp.criteria.map((c, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{c.label}</td>
                        <td style={{ color: '#0f172a' }}>{c.studentValue}</td>
                        <td style={{ color: '#475569' }}>{c.requiredValue}</td>
                        <td>
                          {c.matched ? (
                            <span className="cc-badge" data-tone="success">
                              ✓ Matched
                            </span>
                          ) : (
                            <span className="cc-badge" data-tone="warning">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Document Locker Checklist */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f766e', margin: 0 }}>
                  📁 Required Application Documents (Document Locker)
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Institutional repository integration
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedOpp.requiredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '6px',
                      background: doc.lockerStatus === 'missing' ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${doc.lockerStatus === 'missing' ? '#fde68a' : '#e2e8f0'}`,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block' }}>
                        {doc.title}
                      </strong>
                      <span style={{ fontSize: '0.775rem', color: '#64748b' }}>
                        {doc.required ? 'Mandatory for submission' : 'Optional document'}
                      </span>
                    </div>

                    <div>
                      {doc.lockerStatus === 'verified' && (
                        <span className="cc-badge" data-tone="success">
                          ✓ Locker Verified
                        </span>
                      )}
                      {doc.lockerStatus === 'uploaded' && (
                        <span className="cc-badge" data-tone="info">
                          ✓ Uploaded
                        </span>
                      )}
                      {doc.lockerStatus === 'missing' && (
                        <span className="cc-badge" data-tone="warning">
                          ⚠️ Action Needed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dialog Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <Button
                variant="secondary"
                onPress={() => {
                  toggleSave.mutate(selectedOpp.id);
                }}
              >
                {selectedOpp.isSaved ? '★ Saved in Tracker' : '☆ Save to Tracker'}
              </Button>
              <a
                href={selectedOpp.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="cc-button"
                style={{ textDecoration: 'none' }}
              >
                Proceed to Application Portal ↗
              </a>
              <Button variant="secondary" onPress={() => setSelectedOpp(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

