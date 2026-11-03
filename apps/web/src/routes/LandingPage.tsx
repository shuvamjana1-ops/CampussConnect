import { Link } from 'react-router';
import { useSession } from '../auth/session';

export default function LandingPage() {
  const { user, role } = useSession();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <nav
        style={{
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#0f2850',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
              fontWeight: 900,
              fontSize: '1.35rem',
              boxShadow: '0 4px 14px rgba(15, 40, 80, 0.25)',
            }}
          >
            J
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              CampusConnect
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>
              JIS UNIVERSITY ENTERPRISE
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '9999px', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 700 }}>
            ⚡ Supabase RLS Enforced
          </span>
          {user ? (
            <Link
              to={role === 'admin' ? '/admin' : role === 'worker' ? '/worker' : '/student'}
              className="cf-btn cf-btn-admin"
              style={{ textDecoration: 'none' }}
            >
              Enter Dashboard ({role?.toUpperCase()}) →
            </Link>
          ) : (
            <Link
              to="/login"
              className="cf-btn cf-btn-admin"
              style={{ textDecoration: 'none' }}
            >
              Sign In to Portal →
            </Link>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section
        style={{
          padding: '5rem 2rem 4rem',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
          flex: 1,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '9999px', background: 'rgba(29, 78, 216, 0.1)', color: '#1d4ed8', fontSize: '0.825rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>
          <span>🛡️</span> ZERO-TRUST POSTGRESQL MULTI-ROLE ARCHITECTURE
        </div>

        <h1 style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 1.5rem', color: 'var(--text-main)' }}>
          Next-Generation College Operating System & Triage Engine.
        </h1>

        <p style={{ fontSize: '1.2rem', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: '780px', margin: '0 auto 3rem' }}>
          Strictly secured by default with Supabase Auth, PostgreSQL Row-Level Security (RLS), and verified role isolation. Zero cross-student data leaks, zero privilege escalation.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '4.5rem' }}>
          <Link
            to="/login"
            className="cf-btn cf-btn-admin"
            style={{ padding: '14px 28px', fontSize: '1.05rem', textDecoration: 'none', borderRadius: '12px' }}
          >
            Launch System Demo (5 Verified Roles) →
          </Link>
        </div>

        {/* 3 Interactive Doors */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
          {/* Student Door */}
          <div className="cf-card cf-card-hover" style={{ borderTop: '4px solid var(--student-accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--student-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                🎓
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Student Portal</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--student-primary)', fontWeight: 700 }}>
                  Role: student · Ananya Das / Rohan Sharma
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Direct grievance lodging, real-time 4-stage tracking bar, academic internal marks roster, and curated Indian scholarship gateway.
            </p>
            <Link
              to="/login"
              style={{ color: 'var(--student-primary)', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Sign In as Student →
            </Link>
          </div>

          {/* Worker Door */}
          <div className="cf-card cf-card-hover" style={{ borderTop: '4px solid var(--worker-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--worker-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                🔧
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Worker / Staff Portal</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--worker-primary)', fontWeight: 700 }}>
                  Role: worker · Prof. Rahul Mehta / Er. Dilip Roy
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Role-filtered work orders, fast status transitions, resolution note dispatch, and work inspection checklist recording.
            </p>
            <Link
              to="/login"
              style={{ color: 'var(--worker-primary)', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Sign In as Worker →
            </Link>
          </div>

          {/* Admin Door */}
          <div className="cf-card cf-card-hover" style={{ borderTop: '4px solid var(--admin-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--admin-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                🛡️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Administrative Panel</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--admin-primary)', fontWeight: 700 }}>
                  Role: admin · Dr. Suresh Kumar (Dean)
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Universal complaint command center, cross-tenant SLA analytics, all users directory, and live PostgreSQL RLS security audit.
            </p>
            <Link
              to="/login"
              style={{ color: 'var(--admin-accent)', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Sign In as Admin →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '2rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        JIS University CampusConnect OS · Developed for Advanced Hackathon Evaluation · Built with React 19, Supabase, Postgres RLS
      </footer>
    </div>
  );
}
