import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { useToast } from '../components/Toast';

export function AppLayout() {
  const { user, profile, role, signOut } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Dark mode state
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('campusflow:theme');
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
        localStorage.setItem('campusflow:theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('campusflow:theme', 'light');
      }
    } catch {
      // ignore
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
    toast(!isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
  };

  const handleSignOut = async () => {
    await signOut();
    toast('Signed out successfully', 'info');
    navigate('/login');
  };

  const activeRole = role || 'student';

  // Navigation Links tailored to Role
  const navLinks = [
    ...(activeRole === 'admin'
      ? [
          { path: '/admin', label: 'Command Center', icon: '⚡' },
          { path: '/admin?tab=tasks', label: 'All Tasks & Grievances', icon: '📋' },
          { path: '/admin?tab=users', label: 'User Directory & Roles', icon: '👥' },
          { path: '/admin?tab=security', label: 'RLS Security Audit', icon: '🛡️' },
        ]
      : []),
    ...(activeRole === 'worker'
      ? [
          { path: '/worker', label: 'Assigned Work Queue', icon: '🔧' },
          { path: '/worker?tab=submissions', label: 'Work Items & Dockets', icon: '📂' },
          { path: '/worker?tab=resolution', label: 'Task Status Transitions', icon: '✓' },
        ]
      : []),
    ...(activeRole === 'student'
      ? [
          { path: '/student', label: 'Personal Dashboard', icon: '🎓' },
          { path: '/student?tab=lodge', label: 'Lodge Grievance / Task', icon: '➕' },
          { path: '/student?tab=scholarships', label: 'Scholarships & Internships', icon: '🎯' },
          { path: '/student?tab=ac', label: 'Academic Section (AC)', icon: '📊' },
        ]
      : []),
  ];

  const roleClass = `active-${activeRole}`;
  const badgeClass = `cf-badge-${activeRole}`;

  return (
    <div className="cf-app-container">
      {/* Sidebar */}
      <aside className="cf-sidebar">
        {/* Brand Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: activeRole === 'admin' ? 'var(--admin-accent)' : activeRole === 'worker' ? 'var(--worker-accent)' : 'var(--student-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '1.25rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            J
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              CampusFlow
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              JIS UNIVERSITY
            </div>
          </div>
        </div>

        {/* Role Navigation */}
        <div style={{ padding: '1.25rem 1rem', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '8px', letterSpacing: '0.05em' }}>
            {activeRole.toUpperCase()} WORKSPACE
          </div>
          {navLinks.map((item) => {
            const isActive = location.pathname + location.search === item.path || (item.path === `/${activeRole}` && location.pathname === `/${activeRole}` && !location.search);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`cf-nav-item ${isActive ? roleClass : ''}`}
              >
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* User Card & Sign Out */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.9rem',
                color: 'var(--text-main)',
              }}
            >
              {profile?.full_name?.[0] ? profile.full_name[0].toUpperCase() : 'U'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.full_name || 'Authenticated User'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || 'user@campusflow.ac'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="cf-btn cf-btn-secondary"
            style={{ width: '100%', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="cf-main-content">
        {/* Topbar */}
        <header className="cf-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className={`cf-role-badge ${badgeClass}`}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
              {activeRole}
            </span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {profile?.department || 'JIS University Campus'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="cf-btn cf-btn-secondary"
              style={{ padding: '6px 10px', borderRadius: '8px' }}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>

            {/* Quick User Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: 'var(--bg-surface-subtle)', borderRadius: '9999px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {profile?.full_name || user?.email}
              </span>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="cf-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
