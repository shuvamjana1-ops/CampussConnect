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

  const handleSelectRole = (option: RoleOption) => {
    switchRole(option.group);
    void navigate(option.path);
  };

  return (
    <div style={{ maxWidth: '840px', margin: '2rem auto' }} className="cc-perspective-container">
      {/* 3D Hero Lockup */}
      <div className="cc-card-3d" style={{ marginBottom: '2.5rem', textAlign: 'center', padding: '2.5rem 1.5rem', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
        <div style={{ position: 'relative', width: '70px', height: '70px', margin: '0 auto 1.25rem' }}>
          <div className="cc-emblem-3d-ring" style={{ width: '70px', height: '70px' }} />
          <div className="cc-emblem-3d-core" style={{ width: '56px', height: '56px', fontSize: '1.75rem', margin: '7px' }}>
            🏛️
          </div>
        </div>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
          Welcome to CampusConnect
        </h1>
        <p style={{ margin: '0 0 1.75rem', color: '#475569', fontSize: '1.05rem', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          Official student services, grievance redressal, and opportunity discovery platform for Indian Higher Education Institutions.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cc-btn-3d"
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
