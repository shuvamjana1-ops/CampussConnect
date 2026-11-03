import { Link, useLocation } from 'react-router';
import { GlassCard } from '../components/GlassCard';
import { LiquidGlassWallpaper } from '../components/LiquidGlassWallpaper';
import { PillButton } from '../components/PillButton';
import { BrandLogo } from '../branding/BrandLogo';

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.25rem',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-system, -apple-system, "SF Pro Display", Inter, system-ui, sans-serif)',
        color: 'var(--text-main, #0f172a)',
      }}
    >
      {/* Background Animated Wallpaper */}
      <LiquidGlassWallpaper role="default" />

      {/* Centered macOS Window Card */}
      <GlassCard
        material="glass-strong"
        spotlight
        style={{
          width: '100%',
          maxWidth: '680px',
          padding: '3rem 2.5rem',
          borderRadius: '28px',
          boxShadow: 'var(--glass-strong-shadow)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* macOS Window Controls Mock */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', letterSpacing: '0.04em' }}>
            HTTP STATUS · 404 NOT FOUND
          </span>
        </div>

        {/* Institution Logo */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: '#0f2850',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            boxShadow: '0 4px 14px rgba(15, 40, 80, 0.25)',
            overflow: 'hidden',
          }}
        >
          <BrandLogo size={34} />
        </div>

        {/* 404 Hero Display */}
        <div
          style={{
            fontSize: 'clamp(4.5rem, 10vw, 6.5rem)',
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            margin: '0 0 0.5rem',
            background: 'linear-gradient(135deg, var(--accent, #2563eb) 0%, #a855f7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          404
        </div>

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            margin: '0 0 0.75rem',
            color: 'var(--text-main, #0f172a)',
          }}
        >
          Page Not Found
        </h1>

        <p
          style={{
            fontSize: '0.95rem',
            color: 'var(--text-secondary, #475569)',
            lineHeight: 1.6,
            maxWidth: '520px',
            margin: '0 auto 1.75rem',
          }}
        >
          The campus resource, docket, or dossier you requested at{' '}
          <code
            className="glass-subtle"
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              fontFamily: 'ui-monospace, "SF Mono", monospace',
              fontSize: '0.85rem',
              color: 'var(--accent, #2563eb)',
              wordBreak: 'break-all',
            }}
          >
            {location.pathname}
          </code>{' '}
          does not exist or has been relocated within the CampusConnect architecture.
        </p>

        {/* Quick Portal Navigation Doors */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            marginBottom: '2.5rem',
            textAlign: 'left',
          }}
        >
          <Link to="/student" style={{ textDecoration: 'none' }}>
            <GlassCard
              interactive
              material="glass-subtle"
              style={{
                padding: '12px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>🎓</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                Student Portal
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Grievances &amp; AC</div>
            </GlassCard>
          </Link>

          <Link to="/portal/staff" style={{ textDecoration: 'none' }}>
            <GlassCard
              interactive
              material="glass-subtle"
              style={{
                padding: '12px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>🔧</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                Staff Workspace
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Work Orders</div>
            </GlassCard>
          </Link>

          <Link to="/portal/admin" style={{ textDecoration: 'none' }}>
            <GlassCard
              interactive
              material="glass-subtle"
              style={{
                padding: '12px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>🛡️</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                Admin Command
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>SLA &amp; RLS Desk</div>
            </GlassCard>
          </Link>

          <Link to="/login" style={{ textDecoration: 'none' }}>
            <GlassCard
              interactive
              material="glass-subtle"
              style={{
                padding: '12px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '1.25rem', marginBottom: '4px' }}>🔑</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main, #0f172a)' }}>
                Sign In Portal
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Authentication</div>
            </GlassCard>
          </Link>
        </div>

        {/* Primary Return Button */}
        <div>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <PillButton size="lg" glow>
              Return to CampusConnect →
            </PillButton>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
