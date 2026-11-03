import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession, type UserRole } from './session';

export function RequireRole({ allowedRoles }: { readonly allowedRoles: readonly UserRole[] }) {
  const { user, profile, role, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid #cbd5e1', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Verifying credentials & role authorization...</p>
        </div>
      </div>
    );
  }

  // Not authenticated -> redirect to login
  if (!user || !profile || !role) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Admin has access to all panels, or user's role must match one of the allowed roles
  if (role !== 'admin' && !allowedRoles.includes(role)) {
    // Redirect to user's own home dashboard to avoid broken navigation
    const targetDashboard = role === 'worker' ? '/worker' : '/student';
    return <Navigate to={targetDashboard} replace />;
  }

  return <Outlet />;
}

// Backward-compatible alias for existing routes
export function RequireGroup({ group }: { readonly group: 'admin' | 'staff' | 'student' | 'worker' }) {
  const roleTarget: UserRole = group === 'staff' ? 'worker' : (group as UserRole);
  return <RequireRole allowedRoles={[roleTarget]} />;
}
