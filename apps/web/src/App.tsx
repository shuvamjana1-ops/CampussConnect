import { Navigate, Route, Routes } from 'react-router';
import { RequireGroup } from './auth/RequireGroup';
import { useSession, type RouteGroup } from './auth/session';
import AdminHome from './routes/(admin)/Home';
import ExecHome from './routes/(exec)/Home';
import OpsHome from './routes/(ops)/Home';
import StudentHome from './routes/(student)/Home';
import WorkbenchHome from './routes/(workbench)/Home';
import SignIn from './routes/SignIn';
import { Layout } from './shell/Layout';

const GROUP_PATHS: Readonly<Record<RouteGroup, string>> = {
  student: '/student',
  workbench: '/workbench',
  exec: '/exec',
  admin: '/admin',
  ops: '/ops',
};

function Landing() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'cc-spin 0.8s linear infinite', marginBottom: '1rem' }} />
        <p role="status" style={{ color: '#1e3a8a', fontWeight: 700 }}>Loading CampusConnect…</p>
      </div>
    );
  }
  const first = session?.groups[0];
  return <Navigate to={first ? GROUP_PATHS[first] : '/sign-in'} replace />;
}

function group(path: string, name: RouteGroup, title: string, element: React.ReactNode) {
  return (
    <Route element={<RequireGroup group={name} />}>
      <Route element={<Layout title={title} />}>
        <Route path={path} element={element} />
      </Route>
    </Route>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Layout title="CampusConnect" />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route
          path="/forbidden"
          element={
            <div className="cc-container" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div className="cc-card" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1.5rem', borderLeft: '4px solid #b91c1c' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🔒</span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem' }}>Access Restricted</h2>
                <p role="alert" style={{ color: '#475569', margin: '0 0 1.25rem' }}>You do not have access to this area.</p>
                <a href="/sign-in" className="cc-button" style={{ background: '#1e3a8a', color: '#ffffff' }}>Switch Persona / Sign In</a>
              </div>
            </div>
          }
        />
      </Route>
      {group('/student/*', 'student', 'My requests', <StudentHome />)}
      {group('/workbench/*', 'workbench', 'Workbench', <WorkbenchHome />)}
      {group('/exec/*', 'exec', 'Executive', <ExecHome />)}
      {group('/admin/*', 'admin', 'Administration', <AdminHome />)}
      {group('/ops/*', 'ops', 'Operations', <OpsHome />)}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
