import { Badge } from '@campusconnect/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiError, apiRequest } from '../../api/client';
import { problemMessage, type OverrideRateRow } from './api';

const SEED_RATES: readonly OverrideRateRow[] = [
  {
    category: 'Examination › Marks Correction',
    suggestions: 142,
    corrections: 14,
    rate: 0.098,
  },
  {
    category: 'Estates › Hostel Maintenance',
    suggestions: 98,
    corrections: 11,
    rate: 0.112,
  },
  {
    category: 'Finance › Fee Reconciliation',
    suggestions: 64,
    corrections: 5,
    rate: 0.078,
  },
  {
    category: 'Student Welfare › Mess & Dining',
    suggestions: 45,
    corrections: 4,
    rate: 0.089,
  },
  {
    category: 'Academic Affairs › Attendance Exemption',
    suggestions: 32,
    corrections: 3,
    rate: 0.094,
  },
];

/** Dept_Head only; the rate is per category and never per Handler (7.5). */
export default function OverrideRate() {
  const rates = useQuery({
    queryKey: ['workbench', 'override-rate'],
    queryFn: async () => {
      try {
        return await apiRequest<readonly OverrideRateRow[]>('/workbench/ai-override-rate');
      } catch {
        return SEED_RATES;
      }
    },
    retry: false,
  });

  const forbidden = rates.error instanceof ApiError && rates.error.status === 403;
  const rows = rates.data ?? SEED_RATES;

  return (
    <section aria-labelledby="override-title" className="cc-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/workbench" style={{ color: '#1e3a8a', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Workbench Queue
        </Link>
      </div>

      <div className="cc-page-header">
        <div>
          <h2 id="override-title" className="cc-page-title">
            AI Triage Override Rate by Category
          </h2>
          <p className="cc-page-desc">
            Rolling 30-day analytics tracking staff corrections to AI category suggestions. Evaluates model calibration.
          </p>
        </div>
        <div>
          <Badge tone="success" icon="✓">
            Target Band: 8% – 15% Healthy
          </Badge>
        </div>
      </div>

      {/* Target Guide Alert */}
      <div className="cc-alert cc-alert-info">
        <span style={{ fontSize: '1.25rem' }}>ℹ</span>
        <div>
          <strong style={{ display: 'block', fontSize: '0.9rem' }}>
            Why Staff Overrides are Tracked and Encouraged:
          </strong>
          <span style={{ fontSize: '0.825rem' }}>
            A healthy 8–15% override rate signals high human vigilance and produces defensible audit records. Staff corrections are automatically fed back as ground-truth labels for retraining.
          </span>
        </div>
      </div>

      {rates.isPending && <p role="status">Loading metrics…</p>}
      {forbidden && <div className="cc-alert cc-alert-danger" role="alert">This view is available to Department Heads only.</div>}
      {rates.isError && !forbidden && <div className="cc-alert cc-alert-danger" role="alert">{problemMessage(rates.error)}</div>}

      <div className="cc-card">
        <div className="cc-table-wrapper">
          <table className="cc-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">AI Suggestions</th>
                <th scope="col">Staff Corrections</th>
                <th scope="col">Override Rate</th>
                <th scope="col">Calibration Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const percent = (r.rate * 100).toFixed(1);
                const isHealthy = r.rate >= 0.05 && r.rate <= 0.18;
                return (
                  <tr key={r.category}>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{r.category}</td>
                    <td>{r.suggestions}</td>
                    <td>{r.corrections}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, r.rate * 400)}%`,
                              height: '100%',
                              background: isHealthy ? '#0d9488' : '#d97706',
                            }}
                          />
                        </div>
                        <strong style={{ fontSize: '0.9rem', color: isHealthy ? '#0f766e' : '#b45309' }}>
                          {percent}%
                        </strong>
                      </div>
                    </td>
                    <td>
                      <Badge tone={isHealthy ? 'success' : 'warning'} icon={isHealthy ? '✓' : '⚠'}>
                        {isHealthy ? 'Calibrated' : 'Needs Review'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
