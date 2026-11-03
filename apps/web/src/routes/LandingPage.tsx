import { Link } from 'react-router';
import { useSession } from '../auth/session';
import { GlassCard } from '../components/GlassCard';
import { LiquidGlassWallpaper } from '../components/LiquidGlassWallpaper';
import { PillButton } from '../components/PillButton';
import { BrandLogo } from '../branding/BrandLogo';

export default function LandingPage() {
  const { user, role } = useSession();

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-system, -apple-system, "SF Pro Display", Inter, system-ui, sans-serif)',
        color: 'var(--text-main, #0f172a)',
        overflowX: 'hidden',
      }}
    >
      {/* Animated Floating Orbs Wallpaper */}
      <LiquidGlassWallpaper role="default" />

      {/* Sticky Blurred Glass Navigation Bar (.glass-strong) */}
      <nav
        className="glass-strong"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          borderRadius: 0,
          backdropFilter: 'blur(38px) saturate(180%)',
          WebkitBackdropFilter: 'blur(38px) saturate(180%)',
        }}
      >
        {/* Institutional Brand Lockup */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#0f2850',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(15, 40, 80, 0.25)',
              overflow: 'hidden',
            }}
          >
            <BrandLogo size={28} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 900,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: 'var(--text-main, #0f172a)',
              }}
            >
              CampusConnect
            </div>
            <div
              style={{
                fontSize: '0.725rem',
                fontWeight: 800,
                color: '#f59e0b',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              JIS UNIVERSITY ENTERPRISE
            </div>
          </div>
        </Link>

        {/* Right Nav Actions & Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span
            className="glass-subtle"
            style={{
              fontSize: '0.75rem',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontWeight: 700,
              color: 'var(--text-muted, #64748b)',
              display: 'none',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡</span> Supabase RLS Enforced
          </span>

          {user ? (
            <Link
              to={role === 'admin' ? '/admin' : role === 'worker' ? '/worker' : '/student'}
              style={{ textDecoration: 'none' }}
            >
              <PillButton variant="primary" size="md" glow>
                Enter Dashboard ({role?.toUpperCase()}) →
              </PillButton>
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Link to="/signup" style={{ textDecoration: 'none' }}>
                <PillButton variant="glass" size="md">
                  Sign Up
                </PillButton>
              </Link>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <PillButton variant="primary" size="md" glow>
                  Sign In to Portal →
                </PillButton>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '3.5rem 1.5rem 5rem', maxWidth: '1240px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Hero Section */}
        <section style={{ textAlign: 'center', marginBottom: '4.5rem' }}>
          {/* Architecture Badge */}
          <div
            className="glass-subtle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              borderRadius: '9999px',
              color: 'var(--accent, #2563eb)',
              fontSize: '0.8rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              marginBottom: '1.75rem',
              letterSpacing: '0.06em',
            }}
          >
            <span>🛡️</span> ZERO-TRUST POSTGRESQL MULTI-ROLE ARCHITECTURE
          </div>

          <h1
            style={{
              fontSize: 'clamp(2.4rem, 5vw, 4rem)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: '0 auto 1.5rem',
              maxWidth: '920px',
              color: 'var(--text-main, #0f172a)',
            }}
          >
            Next-Generation College Operating System &amp; Triage Engine.
          </h1>

          <div
            style={{
              fontSize: '0.9rem',
              fontWeight: 800,
              color: '#f59e0b',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: '-0.75rem auto 1.5rem',
            }}
          >
            Igniting Minds, Empowering Futures
          </div>

          <p
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              lineHeight: 1.6,
              color: 'var(--text-secondary, #475569)',
              maxWidth: '780px',
              margin: '0 auto 2.5rem',
            }}
          >
            Strictly secured by default with Supabase Auth, PostgreSQL Row-Level Security (RLS), and verified role isolation. Zero cross-student data leaks, zero privilege escalation.
          </p>

          {/* Call to Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '3.5rem',
            }}
          >
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <PillButton size="lg" glow>
                Launch System Demo (5 Verified Roles) →
              </PillButton>
            </Link>
            <Link to="/signup" style={{ textDecoration: 'none' }}>
              <PillButton variant="glass" size="lg">
                Create Institutional Account →
              </PillButton>
            </Link>
          </div>

          {/* Quick Stat Ribbon */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              maxWidth: '960px',
              margin: '0 auto',
            }}
          >
            <GlassCard material="glass-subtle" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--accent, #2563eb)' }}>100%</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                Postgres RLS Enforced
              </div>
            </GlassCard>

            <GlassCard material="glass-subtle" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--staff-accent, #0d9488)' }}>&lt; 24h</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                Mean Grievance SLA
              </div>
            </GlassCard>

            <GlassCard material="glass-subtle" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--admin-accent, #6366f1)' }}>5 Roles</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                Verified Instant Access
              </div>
            </GlassCard>

            <GlassCard material="glass-subtle" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#f59e0b' }}>0 Leakage</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                Zero Cross-Tenant Access
              </div>
            </GlassCard>
          </div>
        </section>

        {/* 3 Interactive Role Entry Doors */}
        <section style={{ marginBottom: '5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 0.5rem' }}>
              Explore Role-Isolated Portals
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', fontSize: '0.95rem' }}>
              Direct portals tailored with bespoke palettes, row-level data security, and instant demo quick-fill.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {/* Student Door */}
            <GlassCard
              interactive
              material="glass"
              style={{
                borderTop: '4px solid var(--student-accent, #2563eb)',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'rgba(37, 99, 235, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                    }}
                  >
                    🎓
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Student Portal</h3>
                    <span style={{ fontSize: '0.785rem', color: 'var(--student-primary, #1d4ed8)', fontWeight: 700 }}>
                      Role: student · Ananya Das / Rohan Sharma
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.925rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
                  Direct grievance lodging, real-time 4-stage tracking bar, academic internal marks roster, and curated Indian scholarship gateway.
                </p>
              </div>

              <Link
                to="/login"
                style={{
                  color: 'var(--student-primary, #1d4ed8)',
                  fontWeight: 700,
                  fontSize: '0.925rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Sign In as Student →
              </Link>
            </GlassCard>

            {/* Staff Door (Strictly "Staff", replacing worker in UI) */}
            <GlassCard
              interactive
              material="glass"
              style={{
                borderTop: '4px solid var(--staff-accent, #0d9488)',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'rgba(13, 148, 136, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                    }}
                  >
                    🔧
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Staff Workspace</h3>
                    <span style={{ fontSize: '0.785rem', color: 'var(--staff-primary, #0f766e)', fontWeight: 700 }}>
                      Role: staff · Prof. Rahul Mehta / Er. Dilip Roy
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.925rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
                  Role-filtered work orders, fast status transitions, resolution note dispatch, and work inspection checklist recording.
                </p>
              </div>

              <Link
                to="/login"
                style={{
                  color: 'var(--staff-primary, #0f766e)',
                  fontWeight: 700,
                  fontSize: '0.925rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Sign In as Staff →
              </Link>
            </GlassCard>

            {/* Admin Door */}
            <GlassCard
              interactive
              material="glass"
              style={{
                borderTop: '4px solid var(--admin-accent, #6366f1)',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                    }}
                  >
                    🛡️
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Administrative Panel</h3>
                    <span style={{ fontSize: '0.785rem', color: 'var(--admin-primary, #4338ca)', fontWeight: 700 }}>
                      Role: admin · Dr. Suresh Kumar (Dean)
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.925rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.55, marginBottom: '1.5rem' }}>
                  Universal complaint command center, cross-tenant SLA analytics, all users directory, and live PostgreSQL RLS security audit.
                </p>
              </div>

              <Link
                to="/login"
                style={{
                  color: 'var(--admin-accent, #6366f1)',
                  fontWeight: 700,
                  fontSize: '0.925rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Sign In as Admin →
              </Link>
            </GlassCard>
          </div>
        </section>

        {/* Bento Grid Features Showcase */}
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 0.5rem' }}>
              Built for Campus Scale &amp; Integrity
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', fontSize: '1rem' }}>
              Enterprise architectural capabilities purpose-engineered for JIS University operations.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: '1.5rem',
            }}
          >
            {/* Bento Card 1: 4-Stage Stepper (Span 12) */}
            <GlassCard
              material="glass"
              style={{
                gridColumn: 'span 12',
                padding: '2.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', display: 'inline-block', marginBottom: '8px' }}>⚡</span>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
                    Real-Time Grievance Triage &amp; 4-Stage Dynamic Workflow
                  </h3>
                  <p style={{ color: 'var(--text-secondary, #475569)', margin: 0, maxWidth: '650px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    Students lodge grievances with categorized department routing. Resolution proceeds through a live 4-stage tracking stepper with instant resolution notes and staff assignment.
                  </p>
                </div>
                <div
                  className="glass-subtle"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.785rem',
                    fontWeight: 700,
                    color: 'var(--staff-primary, #0f766e)',
                  }}
                >
                  Active Tracking Engine
                </div>
              </div>

              {/* Stepper Mock Visualization */}
              <div
                className="glass-subtle"
                style={{
                  padding: '1.25rem',
                  borderRadius: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                {[
                  { step: '1', title: 'Submitted', desc: 'Complaint Lodged', done: true },
                  { step: '2', title: 'Under Review', desc: 'Cell Verification', done: true },
                  { step: '3', title: 'Assigned to Staff', desc: 'Work Order Dispatched', done: true },
                  { step: '4', title: 'Resolved', desc: 'Clearance Confirmed', done: false },
                ].map((s) => (
                  <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: s.done ? 'var(--accent, #2563eb)' : 'rgba(0, 0, 0, 0.1)',
                        color: s.done ? '#ffffff' : 'var(--text-muted, #64748b)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                      }}
                    >
                      {s.done ? '✓' : s.step}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>
                        {s.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Bento Card 2: Academic AC Section (Span 6) */}
            <GlassCard
              material="glass"
              style={{
                gridColumn: 'span 6',
                padding: '2rem',
              }}
            >
              <span style={{ fontSize: '1.5rem', display: 'inline-block', marginBottom: '8px' }}>📊</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
                Academic Section (AC) Roster
              </h3>
              <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                Direct continuous assessment marks roster, internal examination discrepancy resolution, and semester fee dues clearance validation.
              </p>
            </GlassCard>

            {/* Bento Card 3: Indian Scholarships Gateway (Span 6) */}
            <GlassCard
              material="glass"
              style={{
                gridColumn: 'span 6',
                padding: '2rem',
              }}
            >
              <span style={{ fontSize: '1.5rem', display: 'inline-block', marginBottom: '8px' }}>🏛️</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
                Curated Indian Scholarships &amp; Opportunities
              </h3>
              <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                Verified gateways to NSP, AICTE Pragati, PM-USP Central Sector schemes, and premier national research fellowships with direct eligibility check.
              </p>
            </GlassCard>

            {/* Bento Card 4: Global Command Palette (Span 12) */}
            <GlassCard
              material="glass"
              style={{
                gridColumn: 'span 12',
                padding: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.5rem',
              }}
            >
              <div style={{ maxWidth: '640px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1.25rem' }}>⌘</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                    macOS Command Palette Navigation
                  </h3>
                </div>
                <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                  Press <kbd style={{ padding: '2px 8px', borderRadius: '6px', background: 'var(--glass-subtle-bg)', border: '1px solid var(--glass-border)', fontSize: '0.8rem', fontWeight: 700 }}>⌘K</kbd> or <kbd style={{ padding: '2px 8px', borderRadius: '6px', background: 'var(--glass-subtle-bg)', border: '1px solid var(--glass-border)', fontSize: '0.8rem', fontWeight: 700 }}>Ctrl+K</kbd> anywhere in the application for instant search, quick actions, role switching, and accessibility settings.
                </p>
              </div>

              <Link to="/login" style={{ textDecoration: 'none' }}>
                <PillButton variant="secondary" size="md">
                  Experience Now →
                </PillButton>
              </Link>
            </GlassCard>
          </div>
        </section>
      </main>

      {/* Frosted Glass Footer */}
      <footer
        className="glass"
        style={{
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          borderRadius: 0,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          fontSize: '0.875rem',
          color: 'var(--text-muted, #64748b)',
        }}
      >
        <div style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
          JIS University CampusConnect OS · Developed for Advanced Hackathon Evaluation · Built with React 19, Supabase, Postgres RLS
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <Link to="/login" style={{ color: 'inherit', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/signup" style={{ color: 'inherit', textDecoration: 'none' }}>Create Account</Link>
          <Link to="/student" style={{ color: 'inherit', textDecoration: 'none' }}>Student Portal</Link>
          <Link to="/worker" style={{ color: 'inherit', textDecoration: 'none' }}>Staff Workspace</Link>
          <Link to="/admin" style={{ color: 'inherit', textDecoration: 'none' }}>Administrative Command</Link>
        </div>
      </footer>
    </div>
  );
}
