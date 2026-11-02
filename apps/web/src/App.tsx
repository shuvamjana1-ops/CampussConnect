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
  if (loading) return <p role="status">Loading…</p>;
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
        <Route path="/forbidden" element={<p role="alert">You do not have access to this area.</p>} />
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
