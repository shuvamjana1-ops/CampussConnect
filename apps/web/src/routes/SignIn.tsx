import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { useToast } from '../components/Toast';

export default function SignIn() {
  const { signIn, isConfigured } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState('student1@demo.com');
  const [password, setPassword] = useState('Student@123');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillCredentials = (demoEmail: string, demoPass: string, label: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
    toast(`Populated credentials for ${label}`, 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
      toast('Login failed', 'error');
      return;
    }

    toast(`Authenticated as ${result.role?.toUpperCase() || 'USER'}!`, 'success');

    // Route to appropriate dashboard based on Supabase verified profile role
    if (result.role === 'admin') {
      navigate('/admin');
    } else if (result.role === 'worker') {
      navigate('/worker');
    } else {
      navigate('/student');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexWrap: 'wrap',
        background: 'var(--bg-page)',
      }}
    >
      {/* Left Visual Panel */}
      <div
        style={{
          flex: '1 1 450px',
          background: 'linear-gradient(135deg, #0a192f 0%, #0f2850 50%, #1e3a8a 100%)',
          color: '#ffffff',
          padding: '3.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Institution Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '3rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 900,
                color: '#0f2850',
                boxShadow: '0 8px 20px rgba(245, 158, 11, 0.4)',
              }}
            >
              J
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                JIS UNIVERSITY
              </div>
              <div style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: 600, letterSpacing: '0.05em' }}>
                CampusConnect Enterprise Portal
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1.15, marginBottom: '1.25rem', letterSpacing: '-0.03em' }}>
            Zero-Trust Campus Operations & Grievance Engine.
          </h1>
          <p style={{ fontSize: '1rem', lineHeight: 1.6, color: '#cbd5e1', maxWidth: '440px', marginBottom: '2.5rem' }}>
            Powered by Supabase Auth, PostgreSQL Row-Level Security (RLS), and verified role-based access control for students, workers, and administrative leadership.
          </p>

          {/* Architecture Badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '420px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <span style={{ fontSize: '1.25rem' }}>🛡️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>RLS Security Enforced</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Row-level policies prevent cross-tenant data leaks.</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <span style={{ fontSize: '1.25rem' }}>🔒</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Anti-Privilege Escalation Trigger</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>User roles locked in DB; client tampering is rejected.</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <span style={{ fontSize: '1.25rem' }}>⚡</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Real-Time Status Progression</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Submitted → Under Review → Assigned → Resolved.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ position: 'relative', zIndex: 2, paddingTop: '2rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.8rem', color: '#94a3b8' }}>
          JIS University CampusConnect Portal · Academic Session 2026-27
        </div>
      </div>

      {/* Right Login Panel */}
      <div
        style={{
          flex: '1 1 500px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2.5rem 2rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Sign In to Your Portal
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Select a demo profile or enter your verified credentials.
            </p>
          </div>

          {/* DEMO CREDENTIALS BOX */}
          <div
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '14px',
              padding: '1.25rem',
              marginBottom: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🔑 One-Click Demo Credentials
              </span>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', background: isConfigured ? '#dcfce7' : '#fef3c7', color: isConfigured ? '#15803d' : '#b45309', fontWeight: 700 }}>
                {isConfigured ? 'Supabase Connected' : 'Demo Sandbox'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Admin Button */}
              <button
                type="button"
                onClick={() => fillCredentials('admin@demo.com', 'Admin@123', 'Administrator')}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.825rem', color: 'var(--admin-primary)', display: 'block' }}>
                    🛡️ Administrative Command Center
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>admin@demo.com · JISU-ADM-001</span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-accent)' }}>
                  Fill →
                </span>
              </button>

              {/* Workers Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => fillCredentials('worker1@demo.com', 'Worker@123', 'Worker 1 (Exam Warden)')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', color: 'var(--worker-primary)' }}>
                    🔧 Staff &amp; Faculty Portal (Exam)
                  </strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>worker1@demo.com · JISU-STAFF-104</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillCredentials('worker2@demo.com', 'Worker@123', 'Worker 2 (Estates)')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', color: 'var(--worker-primary)' }}>
                    🔧 Staff &amp; Faculty Portal (Estates)
                  </strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>worker2@demo.com · JISU-EST-202</span>
                </button>
              </div>

              {/* Students Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => fillCredentials('student1@demo.com', 'Student@123', 'Student 1 (Ananya Das)')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', color: 'var(--student-primary)' }}>
                    🎓 Student Portal (CSE)
                  </strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>student1@demo.com · JISU/2024/CSE/0842</span>
                </button>

                <button
                  type="button"
                  onClick={() => fillCredentials('student2@demo.com', 'Student@123', 'Student 2 (Rohan Sharma)')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ fontSize: '0.8rem', color: 'var(--student-primary)' }}>
                    🎓 Student Portal (ECE)
                  </strong>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>student2@demo.com</span>
                </button>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--status-urgent-bg)',
                color: 'var(--status-urgent-text)',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@demo.com"
                className="cf-input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="cf-input"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="cf-btn cf-btn-admin"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: '0.5rem' }}
            >
              {submitting ? 'Verifying Credentials...' : 'Authenticate & Enter Portal →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
