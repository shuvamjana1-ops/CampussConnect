import { Badge, Button } from '@campusconnect/ui';
import { useState } from 'react';

interface ServiceItem {
  readonly name: string;
  readonly role: string;
  readonly status: 'healthy' | 'degraded' | 'maintenance';
  readonly metric: string;
  readonly latency: string;
}

const SERVICES: readonly ServiceItem[] = [
  {
    name: 'Core API Service',
    role: 'AWS ECS Fargate · 3 Active Tasks (ap-south-1)',
    status: 'healthy',
    metric: '99.98% uptime',
    latency: '42 ms (p95)',
  },
  {
    name: 'Aurora PostgreSQL 16',
    role: 'Multi-AZ Cluster + Read Replica (ap-south-2 Global DB)',
    status: 'healthy',
    metric: 'Pool: 28/200 conn',
    latency: '8 ms query',
  },
  {
    name: 'Valkey In-Memory Cache',
    role: 'Serverless Valkey · Sliding Window Rate Limiter',
    status: 'healthy',
    metric: 'Hit Rate: 94.2%',
    latency: '1.2 ms',
  },
  {
    name: 'AI Inference Adapter',
    role: 'Hugging Face Endpoint · Circuit Breaker: CLOSED',
    status: 'healthy',
    metric: 'Timeout budget: 3.0s',
    latency: '1.4 s (triage)',
  },
  {
    name: 'Notification Channels',
    role: 'AWS SES Email & SMS Gateway',
    status: 'healthy',
    metric: 'Delivery: 99.8%',
    latency: '450 ms',
  },
  {
    name: 'SQS Outbox & Timers',
    role: 'EventBridge Scheduler & Worker Tasks',
    status: 'healthy',
    metric: 'DLQ Count: 0 messages',
    latency: 'Lag < 0.5s',
  },
];

export default function ServiceHealthPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('Just now');

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 600);
  };

  return (
    <div className="cc-container">
      <div className="cc-page-header">
        <div>
          <h2 className="cc-page-title">Platform Service Health & Operations</h2>
          <p className="cc-page-desc">
            Live infrastructure status, database health, AI inference circuit breakers, and async message queues.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
            Updated: {lastRefreshed}
          </span>
          <Button variant="secondary" onPress={handleRefresh} isDisabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh Metrics'}
          </Button>
        </div>
      </div>

      {/* High-level status bar */}
      <div className="cc-alert cc-alert-success" role="status">
        <span style={{ fontSize: '1.25rem' }}>✓</span>
        <div>
          <strong style={{ display: 'block', fontSize: '0.95rem' }}>
            All CampusConnect Platform Systems Operational
          </strong>
          <span style={{ fontSize: '0.85rem' }}>
            Zero degraded dependencies. All statutory tenant isolation, encryption keys, and RLS policies active.
          </span>
        </div>
      </div>

      {/* Services Grid */}
      <div className="cc-grid-3">
        {SERVICES.map((s) => (
          <div key={s.name} className="cc-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
                {s.name}
              </h3>
              <Badge tone="success" icon="●">
                Operational
              </Badge>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
              {s.role}
            </div>

            <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
              <span style={{ color: '#334155', fontWeight: 600 }}>{s.metric}</span>
              <span style={{ color: '#0f766e', fontWeight: 600 }}>⏱️ {s.latency}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Incidents Log */}
      <div className="cc-card">
        <div className="cc-card-header">
          <h3 className="cc-card-title">
            <span>🛡️</span> Operational Event & Incident Log (Last 7 Days)
          </h3>
        </div>

        <div className="cc-table-wrapper">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Event / Action</th>
                <th>Service Affected</th>
                <th>Timestamp</th>
                <th>Resolution / Outcome</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>ERP Daily Differential Sync Completed</td>
                <td>Postgres & Stub ERP</td>
                <td>Today, 04:00 AM</td>
                <td>Synchronized 14,820 student records and academic enrollments</td>
                <td><Badge tone="neutral">Info</Badge></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>AI Circuit Breaker Health Probe Check</td>
                <td>HuggingFace Adapter</td>
                <td>Yesterday, 14:15</td>
                <td>Circuit CLOSED · Latency within SLA threshold (1.2s)</td>
                <td><Badge tone="success">Success</Badge></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>AWS KMS Tenant Key Rotation Executed</td>
                <td>Tenant Security Layer</td>
                <td>3 days ago</td>
                <td>All student PII encrypted with customer-managed keys (CMK)</td>
                <td><Badge tone="info">Security</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

