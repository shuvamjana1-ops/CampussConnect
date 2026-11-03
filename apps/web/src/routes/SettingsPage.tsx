import { useState } from 'react';
import { Link } from 'react-router';
import {
  Settings,
  Sun,
  Moon,
  Laptop,
  Bell,
  ShieldCheck,
  Server,
  Key,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Volume2,
  Mail,
  Zap,
} from 'lucide-react';
import { useSession } from '../auth/session';
import { useToast } from '../components/Toast';
import { GlassCard } from '../components/GlassCard';
import { BrandLogo } from '../branding/BrandLogo';
import { InstitutionLogoSection } from '../branding/InstitutionLogoSection';
import { LogoCustomizerModal } from '../branding/LogoCustomizerModal';

export default function SettingsPage() {
  const { role, user } = useSession();
  const { toast } = useToast();

  const activeRole = role === 'worker' ? 'staff' : (role || 'student');
  const isAdmin = activeRole === 'admin';

  // 1. Theme Configuration
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      const saved = localStorage.getItem('campusconnect:theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return 'system';
    } catch {
      return 'system';
    }
  });

  const applyTheme = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    try {
      if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('campusconnect:theme', 'dark');
      } else if (mode === 'light') {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('campusconnect:theme', 'light');
      } else {
        localStorage.removeItem('campusconnect:theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
          document.documentElement.classList.remove('dark');
        }
      }
      window.dispatchEvent(
        new CustomEvent('campusconnect:theme-changed', {
          detail: { isDark: mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) },
        })
      );
      toast(`Theme updated to ${mode.toUpperCase()} mode`, 'info');
    } catch {
      // ignore
    }
  };

  // 2. Notification Preferences State
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySla, setNotifySla] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);

  // 3. Logo Customizer Modal (for quick admin modal flow)
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  const backLink = activeRole === 'student' ? '/student' : activeRole === 'staff' ? '/staff' : '/admin';

  return (
    <div
      className="cc-settings-page-wrapper"
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '24px 16px 80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif',
      }}
    >
      {/* Admin Logo Customizer Modal */}
      {isAdmin && (
        <LogoCustomizerModal isOpen={isLogoModalOpen} onClose={() => setIsLogoModalOpen(false)} />
      )}

      {/* Breadcrumb Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            to={backLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-main, #0f172a)',
              textDecoration: 'none',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </Link>
          <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.8rem' }}>/</span>
          <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.8rem', fontWeight: 500 }}>
            System Preferences
          </span>
        </div>

        {/* Brand Header Lockup (Preserving .cc-brand-lockup, .cc-brand-logo, .cc-logo-customize-trigger for test suite) */}
        <div className="cc-brand-lockup" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="cc-brand-logo" aria-hidden="true" title="JIS University">
            <BrandLogo size={28} />
          </div>
          <div>
            <span className="cc-brand-title" style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              CampusConnect
            </span>
            <span className="cc-brand-sub" style={{ fontSize: '0.675rem', fontWeight: 700, display: 'block', color: 'var(--text-muted, #64748b)' }}>
              JIS UNIVERSITY
            </span>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="cc-logo-customize-trigger"
              onClick={() => setIsLogoModalOpen(true)}
              title="Configure Institution Logo (Admin only)"
              aria-label="Configure Institution Logo"
              style={{
                background: 'rgba(255, 255, 255, 0.6)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                width: '28px',
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Settings size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Glass Header Card */}
      <GlassCard style={{ padding: '2rem', borderRadius: '24px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '0.5rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Settings size={22} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 900,
                color: 'var(--text-main, #0f172a)',
                margin: 0,
                letterSpacing: '-0.025em',
              }}
            >
              System Settings &amp; Configuration
            </h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Customize your interface experience, campus branding, alerts, and security telemetry.
            </p>
          </div>
        </div>
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* SECTION 1: APPEARANCE & THEME CONTROL */}
        <GlassCard style={{ padding: '1.75rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Sun size={18} style={{ color: '#f59e0b' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              Appearance &amp; Visual Theme
            </h2>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)', margin: '0 0 1.25rem 0' }}>
            Select your preferred display theme. Liquid Glass materials adapt with high-contrast accessibility.
          </p>

          {/* Segmented Theme Switcher */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
              padding: '4px',
              borderRadius: '14px',
              background: 'rgba(0, 0, 0, 0.05)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
            }}
          >
            <button
              type="button"
              onClick={() => applyTheme('light')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: '10px',
                border: 'none',
                background: themeMode === 'light' ? '#ffffff' : 'transparent',
                color: themeMode === 'light' ? '#0f172a' : 'var(--text-muted, #64748b)',
                fontWeight: themeMode === 'light' ? 700 : 500,
                fontSize: '0.785rem',
                cursor: 'pointer',
                boxShadow: themeMode === 'light' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 150ms ease',
              }}
            >
              <Sun size={16} />
              <span>Light</span>
            </button>

            <button
              type="button"
              onClick={() => applyTheme('dark')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: '10px',
                border: 'none',
                background: themeMode === 'dark' ? '#1e293b' : 'transparent',
                color: themeMode === 'dark' ? '#f8fafc' : 'var(--text-muted, #64748b)',
                fontWeight: themeMode === 'dark' ? 700 : 500,
                fontSize: '0.785rem',
                cursor: 'pointer',
                boxShadow: themeMode === 'dark' ? '0 2px 8px rgba(0, 0, 0, 0.3)' : 'none',
                transition: 'all 150ms ease',
              }}
            >
              <Moon size={16} />
              <span>Dark</span>
            </button>

            <button
              type="button"
              onClick={() => applyTheme('system')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: '10px',
                border: 'none',
                background: themeMode === 'system' ? '#ffffff' : 'transparent',
                color: themeMode === 'system' ? '#0f172a' : 'var(--text-muted, #64748b)',
                fontWeight: themeMode === 'system' ? 700 : 500,
                fontSize: '0.785rem',
                cursor: 'pointer',
                boxShadow: themeMode === 'system' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 150ms ease',
              }}
            >
              <Laptop size={16} />
              <span>System</span>
            </button>
          </div>
        </GlassCard>

        {/* SECTION 2: NOTIFICATIONS & BROADCASTS */}
        <GlassCard style={{ padding: '1.75rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Bell size={18} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              Notification Channels
            </h2>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)', margin: '0 0 1rem 0' }}>
            Configure real-time alerts for complaints, academic notices, and task SLA milestones.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={14} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  Push Notifications
                </span>
              </div>
              <input
                type="checkbox"
                checked={notifyPush}
                onChange={(e) => setNotifyPush(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={14} style={{ color: '#0d9488' }} />
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  Email Alerts on Ticket Progress
                </span>
              </div>
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={14} style={{ color: '#ea580c' }} />
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  SLA Escalation Alerts
                </span>
              </div>
              <input
                type="checkbox"
                checked={notifySla}
                onChange={(e) => setNotifySla(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Volume2 size={14} style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  Interface Haptic &amp; Sound Chimes
                </span>
              </div>
              <input
                type="checkbox"
                checked={soundEffects}
                onChange={(e) => setSoundEffects(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
            </label>
          </div>
        </GlassCard>
      </div>

      {/* SECTION 3: INSTITUTION LOGO CUSTOMIZATION (Admin Only with Anti-Emoji Validation) */}
      <GlassCard style={{ padding: '2rem', borderRadius: '24px', marginBottom: '1.5rem' }}>
        {isAdmin ? (
          <div>
            <InstitutionLogoSection />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
              <BrandLogo size={32} />
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                  Institution Logo &amp; Identity (Custom Icons)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
                  Official emblem for JIS University. Managed by Central Administration.
                </p>
              </div>
            </div>

            <div
              style={{
                padding: '1rem',
                borderRadius: '12px',
                background: 'rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <ShieldCheck size={18} style={{ color: '#0d9488' }} />
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>
                Institution Logo Customization is strictly governed by Super-User Administrators.
                Contact the Registrar's Office to request official updates to the institutional crest.
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* SECTION 4: DATA SECURITY, RLS & SYSTEM TELEMETRY */}
      <GlassCard style={{ padding: '1.75rem', borderRadius: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <Server size={18} style={{ color: '#059669' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
            System Telemetry &amp; RLS Protection
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Database Security</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#059669', fontWeight: 700, fontSize: '0.9rem' }}>
              <ShieldCheck size={15} />
              <span>PostgreSQL RLS Active</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>Multi-tenant tenant_id isolation</div>
          </div>

          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Authentication Engine</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#2563eb', fontWeight: 700, fontSize: '0.9rem' }}>
              <Key size={15} />
              <span>Supabase Auth v2 (JWT)</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>Active user: {user?.email || 'Demo Session'}</div>
          </div>

          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Platform Release</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#6366f1', fontWeight: 700, fontSize: '0.9rem' }}>
              <CheckCircle2 size={15} />
              <span>v2.4 Liquid Glass Edition</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>JIS University Enterprise Build</div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

