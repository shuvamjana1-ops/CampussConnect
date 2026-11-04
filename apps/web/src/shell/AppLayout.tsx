import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  ClipboardList,
  Users,
  FileText,
  Sparkles,
  BookOpen,
  Search,
  Sun,
  Moon,
  LogOut,
  Edit3,
} from 'lucide-react';
import { useSession } from '../auth/session';
import { useToast } from '../components/Toast';
import { BrandLogo } from '../branding/BrandLogo';
import { LogoCustomizerModal } from '../branding/LogoCustomizerModal';
import { ProfileEditorModal } from '../components/UserProfileSection';
import { FloatingDock } from '../components/FloatingDock';
import { CommandPalette } from '../components/CommandPalette';
import { LiquidGlassWallpaper } from '../components/LiquidGlassWallpaper';

export function AppLayout() {
  const { user, profile, role, signOut } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Dark mode state with campusconnect:theme persistence
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('campusconnect:theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('campusconnect:theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('campusconnect:theme', 'light');
      }
    } catch {
      // ignore
    }
  }, [isDark]);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ isDark?: boolean; theme?: string }>;
      if (typeof custom.detail?.isDark === 'boolean') {
        setIsDark(custom.detail.isDark);
      } else if (custom.detail?.theme) {
        setIsDark(custom.detail.theme === 'dark');
      }
    };
    window.addEventListener('campusconnect:theme-changed', handleThemeChange);
    return () => {
      window.removeEventListener('campusconnect:theme-changed', handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      window.dispatchEvent(
        new CustomEvent('campusconnect:theme-changed', { detail: { isDark: next } }),
      );
      toast(next ? 'Dark mode enabled' : 'Light mode enabled', 'info');
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    toast('Signed out successfully', 'info');
    navigate('/login');
  };

  // Strictly migrate "worker" to "staff" in UI
  const activeRole = role === 'worker' ? 'staff' : (role || 'student');
  const isAdmin = activeRole === 'admin';

  // Navigation Links tailored to active role
  const navLinks = [
    ...(activeRole === 'admin'
      ? [
          { path: '/admin', label: 'Command Center', icon: <ShieldCheck size={18} /> },
          { path: '/admin?tab=tasks', label: 'All Tasks & Grievances', icon: <ClipboardList size={18} /> },
          { path: '/admin?tab=users', label: 'User Directory & Roles', icon: <Users size={18} /> },
          { path: '/admin?tab=security', label: 'RLS Security Audit', icon: <ShieldCheck size={18} /> },
        ]
      : []),
    ...(activeRole === 'staff'
      ? [
          { path: '/portal/staff', label: 'Assigned Work Queue', icon: <CheckCircle2 size={18} /> },
          { path: '/portal/staff?tab=submissions', label: 'Work Items & Dockets', icon: <FileText size={18} /> },
          { path: '/portal/staff?tab=resolution', label: 'Task Status Transitions', icon: <ClipboardList size={18} /> },
        ]
      : []),
    ...(activeRole === 'student'
      ? [
          { path: '/student', label: 'Personal Dashboard', icon: <GraduationCap size={18} /> },
          { path: '/student?tab=lodge', label: 'Lodge Grievance / Task', icon: <ClipboardList size={18} /> },
          { path: '/student?tab=scholarships', label: 'Scholarships & Internships', icon: <Sparkles size={18} /> },
          { path: '/student?tab=ac', label: 'Academic Section (AC)', icon: <BookOpen size={18} /> },
        ]
      : []),
  ];

  const roleAccentColor =
    activeRole === 'admin' ? '#4338ca' : activeRole === 'staff' ? '#0d9488' : '#2563eb';

  return (
    <div
      className="cf-app-container"
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif',
      }}
    >
      {/* Role Orbs Animated Wallpaper */}
      <LiquidGlassWallpaper role={activeRole as any} />

      {/* Global Command Palette */}
      <CommandPalette />

      {/* Modals */}
      {isAdmin && (
        <LogoCustomizerModal isOpen={isLogoModalOpen} onClose={() => setIsLogoModalOpen(false)} />
      )}
      <ProfileEditorModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />

      {/* Floating Glass Sidebar (.glass-strong) */}
      <aside
        className="cf-sidebar glass-strong"
        style={{
          width: '260px',
          margin: '16px 0 16px 16px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Brand Header & Logo */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div className="cc-brand-lockup" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="cc-brand-logo" aria-hidden="true" title="JIS University">
              <BrandLogo size={32} />
            </div>
            <div>
              <div
                className="cc-brand-title"
                style={{
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--text-main, #0f172a)',
                  lineHeight: 1.1,
                }}
              >
                CampusConnect
              </div>
              <div
                className="cc-brand-sub"
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                JIS UNIVERSITY
              </div>
            </div>
          </div>

          {/* Admin Logo Customize Trigger */}
          {isAdmin && (
            <button
              type="button"
              className="cc-logo-customize-trigger"
              onClick={() => setIsLogoModalOpen(true)}
              title="Configure Institution Logo (Admin only)"
              aria-label="Configure Institution Logo"
              style={{
                background: 'rgba(255, 255, 255, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '8px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>

        {/* Role Navigation Links */}
        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: 'var(--text-muted, #64748b)',
              marginBottom: '0.75rem',
              paddingLeft: '10px',
              letterSpacing: '0.06em',
            }}
          >
            {activeRole.toUpperCase()} WORKSPACE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navLinks.map((item) => {
              const isActive =
                location.pathname + location.search === item.path ||
                (item.path === `/${activeRole}` && location.pathname === `/${activeRole}` && !location.search) ||
                (item.path === '/portal/staff' && (location.pathname === '/portal/staff' || location.pathname === '/worker') && !location.search);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`cf-nav-item ${isActive ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '14px',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 700 : 500,
                    textDecoration: 'none',
                    color: isActive ? '#ffffff' : 'var(--text-main, #0f172a)',
                    background: isActive
                      ? `linear-gradient(135deg, ${roleAccentColor}, var(--accent, #3b82f6))`
                      : 'transparent',
                    boxShadow: isActive
                      ? '0 4px 12px var(--accent-glow, rgba(59, 130, 246, 0.3)), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                      : 'none',
                    transition: 'all 180ms cubic-bezier(0.32, 0.72, 0, 1)',
                  }}
                >
                  <span style={{ display: 'inline-flex' }}>{item.icon}</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* User Dossier & Sign Out */}
        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid rgba(0, 0, 0, 0.08)',
            background: 'rgba(255, 255, 255, 0.25)',
          }}
        >
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            title={`Edit Profile: ${profile?.full_name || 'Authenticated User'}`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px',
              borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              marginBottom: '8px',
            }}
          >
            <div
              className="cc-avatar-circle"
              aria-hidden="true"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(200,200,220,0.5))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'var(--text-main, #0f172a)',
                overflow: 'hidden',
                flexShrink: 0,
                border: '1px solid rgba(255, 255, 255, 0.5)',
              }}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || 'User'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : profile?.full_name?.[0] ? (
                profile.full_name[0].toUpperCase()
              ) : (
                'U'
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  color: 'var(--text-main, #0f172a)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {profile?.full_name || 'Authenticated User'}
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted, #64748b)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.email || 'user@campusconnect.ac.in'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              background: 'rgba(255, 255, 255, 0.45)',
              fontSize: '0.785rem',
              fontWeight: 600,
              color: 'var(--text-main, #0f172a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className="cf-main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          padding: '16px 16px 100px 16px', // 100px bottom padding for floating dock clearance
        }}
      >
        {/* Floating Topbar (.glass) */}
        <header
          className="cf-topbar glass"
          style={{
            height: '60px',
            borderRadius: '20px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.05)',
            zIndex: 15,
          }}
        >
          {/* Role Badge and Department */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              className={`cf-role-badge cf-badge-${activeRole}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '0.785rem',
                fontWeight: 700,
                textTransform: 'capitalize',
                background:
                  activeRole === 'admin'
                    ? 'rgba(67, 56, 202, 0.12)'
                    : activeRole === 'staff'
                    ? 'rgba(13, 148, 136, 0.12)'
                    : 'rgba(37, 99, 235, 0.12)',
                color: roleAccentColor,
                border: `1px solid ${
                  activeRole === 'admin'
                    ? 'rgba(67, 56, 202, 0.25)'
                    : activeRole === 'staff'
                    ? 'rgba(13, 148, 136, 0.25)'
                    : 'rgba(37, 99, 235, 0.25)'
                }`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'currentColor',
                  boxShadow: '0 0 6px currentColor',
                }}
              />
              {activeRole}
            </span>
            <span style={{ color: 'rgba(0, 0, 0, 0.15)' }}>|</span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-muted, #64748b)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {profile?.department || 'JIS University Campus'}
            </span>
          </div>

          {/* Quick Actions & Header Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Command Palette Trigger */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('campusconnect:open-command-palette'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                background: 'rgba(255, 255, 255, 0.5)',
                color: 'var(--text-muted, #64748b)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Search size={14} />
              <span>Search...</span>
              <kbd
                style={{
                  fontSize: '0.675rem',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(0, 0, 0, 0.06)',
                }}
              >
                ⌘K
              </kbd>
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                padding: '7px 12px',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                background: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-main, #0f172a)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
              <span>{isDark ? 'Light' : 'Dark'}</span>
            </button>

            {/* Profile Action Button (Test suite compatibility: '👤 Profile') */}
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              style={{
                padding: '7px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                background: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-main, #0f172a)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>👤 Profile</span>
            </button>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="cf-content-area" style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </main>
      </div>

      {/* Floating macOS Dock */}
      <FloatingDock />
    </div>
  );
}

export default AppLayout;
