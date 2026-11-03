import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession, type RouteGroup } from '../auth/session';

interface RoleOption {
  readonly group: RouteGroup | 'all';
  readonly title: string;
  readonly persona: string;
  readonly description: string;
  readonly path: string;
  readonly icon: string;
}

const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    group: 'student',
    title: 'Student Portal',
    persona: 'Ananya Das (B.Tech CSE - 2nd Yr)',
    description: 'File requests & grievances, track SLA progress, browse matched scholarships & aid.',
    path: '/student',
    icon: '🎓',
  },
  {
    group: 'workbench',
    title: 'Staff Workbench',
    persona: 'Rahul Mehta (Exam & Records Cell)',
    description: 'Triage ticket queue with keyboard shortcuts, review AI suggestions, reassign & resolve.',
    path: '/workbench',
    icon: '🛠️',
  },
  {
    group: 'exec',
    title: 'Executive Overview',
    persona: 'Prof. Meera Iyer (Pro Vice-Chancellor)',
    description: 'Track campus VOTR, systemic spike/cluster alerts, and department SLA scorecards.',
    path: '/exec/overview',
    icon: '📊',
  },
  {
    group: 'admin',
    title: 'Institution Admin',
    persona: 'Dr. Suresh Kumar (Registrar)',
    description: 'Manage departments, routing rules, SLA policies, ERP sync & audit verification.',
    path: '/admin/config',
    icon: '⚙️',
  },
  {
    group: 'ops',
    title: 'Platform Operations',
    persona: 'Platform Ops Engineer',
    description: 'Monitor service health, declare SLA breaches, and manage system guardrails.',
    path: '/ops/health',
    icon: '📡',
  },
];

export default function SignIn() {
  const { switchRole } = useSession();
  const navigate = useNavigate();

  // Two dedicated portal doors: Student vs Admin
  const [door, setDoor] = useState<'student' | 'admin'>('student');
  const [username, setUsername] = useState('student');
  const [password, setPassword] = useState('student123');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const handleSelectRole = (option: RoleOption) => {
    switchRole(option.group);
    void navigate(option.path);
  };

  const handlePortalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const user = username.trim().toLowerCase();
    const pass = password.trim();

    if (door === 'student') {
      if (user === 'admin' || user.includes('admin')) {
        setAuthError('You entered an administrator account in the Student Panel door. Please switch to the Admin Portal tab.');
        return;
      }
      if (pass !== 'student123' && pass !== 'password') {
        setAuthError('Invalid student credentials. Try user: student, password: student123');
        return;
      }

      setAuthSuccess('Student authenticated successfully! Redirecting to student panel…');
      switchRole('student');
      setTimeout(() => {
        void navigate('/student');
      }, 350);
    } else {
      // Admin door
      if (user === 'student' || user.includes('student')) {
        setAuthError('Access Denied: Student credentials cannot access the Admin & Staff Workbench. Admin username and password required.');
        return;
      }
      if (pass !== 'admin123' && pass !== 'password') {
        setAuthError('Invalid admin credentials. Try user: admin, password: admin123');
        return;
      }

      setAuthSuccess('Administrator authenticated successfully! Redirecting to Admin Workbench…');
      switchRole('admin');
      setTimeout(() => {
        void navigate('/workbench');
      }, 350);
    }
  };

  const quickFillStudent = () => {
    setDoor('student');
    setUsername('student');
    setPassword('student123');
    setAuthError(null);
  };

  const quickFillAdmin = () => {
    setDoor('admin');
    setUsername('admin');
    setPassword('admin123');
    setAuthError(null);
  };

  return (
    <div style={{ maxWidth: '840px', margin: '2rem auto' }} className="cc-perspective-container">
      {/* 3D Hero Lockup */}
      <div className="cc-card-3d" style={{ marginBottom: '2rem', textAlign: 'center', padding: '2.5rem 1.5rem', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
        <div style={{ position: 'relative', width: '70px', height: '70px', margin: '0 auto 1.25rem' }}>
          <div className="cc-emblem-3d-ring" style={{ width: '70px', height: '70px' }} />
          <div className="cc-emblem-3d-core" style={{ width: '56px', height: '56px', fontSize: '1.75rem', margin: '7px' }}>
            🏛️
          </div>
        </div>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
          Welcome to CampusConnect
        </h1>
        <p style={{ margin: '0 0 1.5rem', color: '#475569', fontSize: '1.05rem', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          Official student services, grievance redressal, and opportunity discovery platform for Indian Higher Education Institutions.
        </p>

        {/* Two Dedicated Portal Access Doors: Student vs Admin */}
        <div
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            background: '#ffffff',
            borderRadius: '14px',
            border: '2px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          {/* Tab Switcher */}
          <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={quickFillStudent}
              style={{
                flex: 1,
                padding: '0.9rem',
                border: 'none',
                background: door === 'student' ? '#ffffff' : 'transparent',
                color: door === 'student' ? '#1e3a8a' : '#64748b',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                borderBottom: door === 'student' ? '3px solid #f59e0b' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🎓</span> Student Panel Login
            </button>
            <button
              type="button"
              onClick={quickFillAdmin}
              style={{
                flex: 1,
                padding: '0.9rem',
                border: 'none',
                background: door === 'admin' ? '#ffffff' : 'transparent',
                color: door === 'admin' ? '#1e3a8a' : '#64748b',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                borderBottom: door === 'admin' ? '3px solid #f59e0b' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🛡️</span> Admin Panel Login
            </button>
          </div>

          <form onSubmit={handlePortalLogin} style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.825rem', color: '#64748b' }}>
              {door === 'student'
                ? 'Authorized student login for requests, grievances, and scholarship tracking.'
                : 'Restricted administrative login for university triage, staff status updates, and SLA governance.'}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="portal-user" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                {door === 'student' ? 'Student ID / Email' : 'Admin Username / Email'}
              </label>
              <input
                id="portal-user"
                className="cc-input"
                value={username}
                onChange={(e) => { setUsername(e.target.value); }}
                style={{ width: '100%' }}
                placeholder={door === 'student' ? 'student' : 'admin'}
                required
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="portal-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                Password
              </label>
              <input
                id="portal-password"
                type="password"
                className="cc-input"
                value={password}
                onChange={(e) => { setPassword(e.target.value); }}
                style={{ width: '100%' }}
                placeholder="••••••••"
                required
              />
            </div>

            {authError && (
              <div role="alert" className="cc-alert cc-alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <span>✖</span> <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div role="status" className="cc-alert cc-alert-success" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <span>✓</span> <span>{authSuccess}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="cc-btn-3d"
                style={{ flex: 1, padding: '0.65rem 1.25rem', fontSize: '0.95rem' }}
              >
                {door === 'student' ? 'Enter Student Panel →' : 'Enter Admin Panel →'}
              </button>

              <button
                type="button"
                className="cc-btn-3d cc-btn-3d-yellow"
                style={{ fontSize: '0.825rem', padding: '0.5rem 0.85rem' }}
                onClick={door === 'student' ? quickFillStudent : quickFillAdmin}
              >
                ⚡ Auto-fill {door === 'student' ? 'Student' : 'Admin'}
              </button>
            </div>
          </form>
        </div>

        <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cc-btn-3d cc-btn-3d-white"
            onClick={() => {
              window.location.assign('/api/v1/auth/sso/login');
            }}
          >
            Continue with Campus SSO
          </button>
          <button
            type="button"
            className="cc-btn-3d cc-btn-3d-saffron"
            onClick={() => {
              switchRole('all');
              void navigate('/student');
            }}
          >
            Explore All Areas (Super Demo)
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem', letterSpacing: '-0.02em' }}>
          Select a Campus Persona to Explore
        </h2>
        <p style={{ margin: '0', color: '#64748b', fontSize: '0.925rem' }}>
          Quickly switch roles to test persona-specific workflows, permissions, and 3D dashboards:
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {ROLE_OPTIONS.map((opt) => (
          <div
            key={opt.group}
            className="cc-card-3d"
            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            onClick={() => {
              handleSelectRole(opt);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectRole(opt);
              }
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{opt.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
                    {opt.title}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600 }}>
                    {opt.persona}
                  </span>
                </div>
              </div>
              <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.45 }}>
                {opt.description}
              </p>
            </div>
            <div>
              <span className="cc-badge" data-tone="info">
                Enter as {opt.group} →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
