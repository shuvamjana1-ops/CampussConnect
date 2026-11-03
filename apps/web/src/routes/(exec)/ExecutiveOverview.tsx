import { Badge, Button } from '@campusconnect/ui';
import { useState } from 'react';
import { Link } from 'react-router';

interface DeptScorecard {
  readonly department: string;
  readonly openVolume: number;
  readonly resolvedCount: number;
  readonly medianFirstResponse: string;
  readonly slaCompliancePercent: number;
  readonly escalations: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly status: 'healthy' | 'warning' | 'critical';
}

const DEPT_SCORECARDS: readonly DeptScorecard[] = [
  {
    department: 'Examination & Records Cell',
    openVolume: 58,
    resolvedCount: 354,
    medianFirstResponse: '1.8 hrs',
    slaCompliancePercent: 89.2,
    escalations: { l1: 6, l2: 2, l3: 0 },
    status: 'healthy',
  },
  {
    department: 'Estates & Campus Facilities',
    openVolume: 84,
    resolvedCount: 236,
    medianFirstResponse: '4.2 hrs',
    slaCompliancePercent: 76.5,
    escalations: { l1: 14, l2: 5, l3: 1 },
    status: 'warning',
  },
  {
    department: 'Hostel & Dining Services',
    openVolume: 42,
    resolvedCount: 242,
    medianFirstResponse: '2.5 hrs',
    slaCompliancePercent: 82.1,
    escalations: { l1: 5, l2: 1, l3: 0 },
    status: 'healthy',
  },
  {
    department: 'Finance & Student Accounts',
    openVolume: 22,
    resolvedCount: 174,
    medianFirstResponse: '2.0 hrs',
    slaCompliancePercent: 92.4,
    escalations: { l1: 2, l2: 0, l3: 0 },
    status: 'healthy',
  },
  {
    department: 'Academic Affairs & Dean Office',
    openVolume: 16,
    resolvedCount: 126,
    medianFirstResponse: '1.5 hrs',
    slaCompliancePercent: 94.1,
    escalations: { l1: 1, l2: 0, l3: 0 },
    status: 'healthy',
  },
  {
    department: 'Student Welfare & Scholarships',
    openVolume: 11,
    resolvedCount: 63,
    medianFirstResponse: '1.2 hrs',
    slaCompliancePercent: 96.0,
    escalations: { l1: 0, l2: 0, l3: 0 },
    status: 'healthy',
  },
];

export default function ExecutiveOverview() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [broadcastSent, setBroadcastSent] = useState(false);

  return (
    <div>
      {/* Page Header */}
      <div className="cc-page-header">
        <div>
          <h2 className="cc-page-title">Executive Operations Overview</h2>
          <p className="cc-page-desc">
            Campus-wide service accountability, Verified On-Time Resolution (VOTR), and systemic anomaly detection.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/exec/reports" className="cc-button cc-button-secondary">
            <span>📑</span> Scheduled Board Packs & Reports
          </Link>
        </div>
      </div>

      {broadcastSent && (
        <div className="cc-alert cc-alert-success" role="status">
          <span>✓</span>
          <span>Targeted emergency broadcast dispatched to all residents of Hostel Block B via Push & In-App notification.</span>
        </div>
      )}

      {/* North Star KPI Card with 3D Depth (PRD §1.4 VOTR) */}
      <div className="cc-hero-3d">
        <div
          className="cc-hero-glow-orb"
          style={{ top: '-80px', right: '15%', background: 'rgba(56, 189, 248, 0.45)' }}
          aria-hidden="true"
        />
        <div
          className="cc-hero-glow-orb"
          style={{ bottom: '-90px', left: '10%', background: 'rgba(245, 158, 11, 0.3)' }}
          aria-hidden="true"
        />

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
          <div style={{ maxWidth: '640px' }} className="cc-depth-sm">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', padding: '0.35rem 0.95rem', borderRadius: '999px', fontSize: '0.825rem', marginBottom: '0.85rem', border: '1px solid rgba(255,255,255,0.2)' }}>
              <span>⭐</span>
              <span style={{ fontWeight: 600 }}>North Star Metric · Verified Resolution Quality</span>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.95rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em' }}>
              Verified On-Time Resolution Rate (VOTR)
            </h3>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '1rem', lineHeight: 1.55 }}>
              Share of campus tickets resolved on time without dispute or reopening within 7 days. Measures genuine institutional service quality, not rushed closures.
            </p>
          </div>

          <div
            className="cc-depth-lg"
            style={{
              textAlign: 'center',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(16px)',
              padding: '1.25rem 2rem',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.5)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#fde047', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Current Performance
            </div>
            <div style={{ fontSize: '3.25rem', fontWeight: 900, color: '#facc15', lineHeight: 1.05, margin: '0.35rem 0', textShadow: '0 0 25px rgba(245, 158, 11, 0.5)' }}>
              78.4%
            </div>
            <div style={{ fontSize: '0.875rem', color: '#fef08a', fontWeight: 600 }}>
              ▲ +7.2% vs last month (Target: 80.0%)
            </div>
          </div>
        </div>
      </div>

      {/* 3D KPI Metrics Grid - Blue, White, and Yellow */}
      <div className="cc-grid-4">
        <div className="cc-stat-box-3d" data-accent="blue">
          <div className="cc-stat-label">Total Requests (MTD)</div>
          <div className="cc-stat-value-3d" style={{ color: '#1e40af' }}>1,428</div>
          <div className="cc-stat-hint">
            <span style={{ color: '#2563eb', fontWeight: 700 }}>1,195 resolved</span> · 233 in queue
          </div>
        </div>

        <div className="cc-stat-box-3d" data-accent="yellow">
          <div className="cc-stat-label">Median First Response</div>
          <div className="cc-stat-value-3d" style={{ color: '#b45309' }}>2.2 hrs</div>
          <div className="cc-stat-hint">
            <span style={{ color: '#f59e0b' }}>★</span> Target: &le; 4.0 business hours
          </div>
        </div>

        <div className="cc-stat-box-3d" data-accent="yellow">
          <div className="cc-stat-label">SLA Compliance</div>
          <div className="cc-stat-value-3d" style={{ color: '#b45309' }}>86.8%</div>
          <div className="cc-stat-hint">
            <span>▲</span> Target &ge; 85% achieved
          </div>
        </div>

        <div className="cc-stat-box-3d" data-accent="danger">
          <div className="cc-stat-label">Dispute & Escalation Rate</div>
          <div className="cc-stat-value-3d" style={{ color: '#b91c1c' }}>3.8%</div>
          <div className="cc-stat-hint">
            <span>●</span> 1 L3 Ombudsperson review active
          </div>
        </div>
      </div>

      {/* Systemic Spike & Cluster Anomaly Alerts (PRD Journey J4) */}
      <div className="cc-card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #d97706' }}>
        <div className="cc-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🚨</span>
            <div>
              <h3 className="cc-card-title" style={{ margin: 0 }}>
                Systemic Anomaly & Cluster Detection
              </h3>
              <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
                Automated statistical anomaly detection (z-score &gt; 2.5) across campus zones
              </span>
            </div>
          </div>
          <span className="cc-badge" data-tone="warning">
            2 Active Clusters
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem' }}>
          {/* Cluster 1: Hostel B Water */}
          <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span className="cc-badge" data-tone="danger">
                z-score: 3.2 · High Spike
              </span>
              <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                Estates & Hostel Services
              </span>
            </div>
            <strong style={{ fontSize: '0.95rem', color: '#0f172a', display: 'block', marginBottom: '0.25rem' }}>
              Mandakini Hostel Block B — Water Pressure & Riser Pipe Failure
            </strong>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
              <strong>42 tickets filed within 36 hours</strong> by Block B residents reporting low pressure. Root cause: pressure valve trip at central pump station.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                onPress={() => {
                  setSelectedCluster('hostel_b');
                }}
              >
                Inspect Cluster (k=42)
              </Button>
              <Button
                onPress={() => {
                  setBroadcastSent(true);
                }}
              >
                📢 Broadcast Update to Residents
              </Button>
            </div>
          </div>

          {/* Cluster 2: Exam Internal Marks */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span className="cc-badge" data-tone="warning">
                z-score: 2.8 · Moderate Spike
              </span>
              <span style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>
                Examination Cell
              </span>
            </div>
            <strong style={{ fontSize: '0.95rem', color: '#0f172a', display: 'block', marginBottom: '0.25rem' }}>
              CS302 Data Structures — Internal Assessment Tabulation Discrepancy
            </strong>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
              <strong>18 grievances filed in 12 hours</strong> after marks portal upload. Hall ticket cut-off in 3 days. Exam Officer currently verifying with course coordinator.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                onPress={() => {
                  setSelectedCluster('cs302');
                }}
              >
                View Department Triage
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Department SLA Performance Scorecards */}
      <div className="cc-card" style={{ marginBottom: '1.5rem' }}>
        <div className="cc-card-header">
          <div>
            <h3 className="cc-card-title">
              <span>📊</span> Department SLA Scorecards & Workload
            </h3>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Evaluated against statutory institution SLAs with automatic level escalation
            </span>
          </div>
          <Link to="/exec/reports" className="cc-button cc-button-secondary" style={{ minHeight: '36px', fontSize: '0.85rem' }}>
            Export CSV / PDF
          </Link>
        </div>

        <div className="cc-table-wrapper">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Open Volume</th>
                <th>Resolved (MTD)</th>
                <th>Median 1st Resp</th>
                <th>SLA Compliance</th>
                <th>Escalations (L1 / L2 / L3)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DEPT_SCORECARDS.map((row) => (
                <tr key={row.department}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{row.department}</td>
                  <td>
                    <span className="cc-badge" data-tone="neutral">
                      {row.openVolume} open
                    </span>
                  </td>
                  <td style={{ color: '#0f766e', fontWeight: 600 }}>{row.resolvedCount}</td>
                  <td>{row.medianFirstResponse}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, color: row.slaCompliancePercent >= 85 ? '#065f46' : '#b45309' }}>
                        {row.slaCompliancePercent}%
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>L1: {row.escalations.l1}</span> ·{' '}
                    <span style={{ color: '#b45309' }}>L2: {row.escalations.l2}</span> ·{' '}
                    <span style={{ color: row.escalations.l3 > 0 ? '#dc2626' : '#64748b', fontWeight: row.escalations.l3 > 0 ? 700 : 400 }}>
                      L3: {row.escalations.l3}
                    </span>
                  </td>
                  <td>
                    <Badge
                      tone={row.status === 'healthy' ? 'success' : 'warning'}
                      icon={row.status === 'healthy' ? '✓' : '⚠'}
                    >
                      {row.status === 'healthy' ? 'On Target' : 'At Risk'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Cluster Drill-Down */}
      {selectedCluster && (
        <div
          role="dialog"
          aria-modal="true"
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
          onClick={() => {
            setSelectedCluster(null);
          }}
        >
          <div
            className="cc-card"
            style={{ maxWidth: '600px', width: '100%', background: '#ffffff', padding: '1.75rem' }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#0f172a' }}>
              Cluster Anomaly Details: {selectedCluster === 'hostel_b' ? 'Mandakini Block B Water Pressure' : 'CS302 Assessment Marks'}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
              Privacy-safe aggregate view enforcing k-anonymity (k &ge; 5). Individual student identities are masked in executive reporting.
            </p>
            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.825rem', color: '#64748b' }}>Assigned Incident Owner</div>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>Executive Engineer (Estates & Water Works)</strong>
              <div style={{ fontSize: '0.825rem', color: '#0d9488', marginTop: '0.25rem' }}>
                Resolution Target: Within 24 hours (Mandatory pump overhaul)
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button
                variant="secondary"
                onPress={() => {
                  setSelectedCluster(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

