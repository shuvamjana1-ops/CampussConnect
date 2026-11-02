import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession, type RouteGroup } from './session';

/** Auth shell: redirects anonymous users to sign-in and blocks principals outside the route group. */
export function RequireGroup({ group }: { readonly group: RouteGroup }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return <p role="status">Loading…</p>;
  if (session === null) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  if (!session.groups.includes(group)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
