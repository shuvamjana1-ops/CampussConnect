import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { ApiError, apiRequest } from '../api/client';

export type RouteGroup = 'student' | 'workbench' | 'exec' | 'admin' | 'ops';

export interface Session {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: string | null;
  /** Route groups the principal may enter, resolved by the API from Tenant RBAC or operator status. */
  readonly groups: readonly RouteGroup[];
  readonly roleTitle?: string;
  readonly department?: string;
}

export const DEMO_PROFILES: Readonly<Record<RouteGroup | 'all', Session>> = {
  student: {
    userId: 'usr_ananya_01',
    displayName: 'Ananya Das',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Student (B.Tech CSE - 2nd Yr)',
    department: 'Computer Science & Engineering',
  },
  workbench: {
    userId: 'usr_rahul_02',
    displayName: 'Rahul Mehta',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Staff Handler',
    department: 'Examination & Records Cell',
  },
  exec: {
    userId: 'usr_meera_03',
    displayName: 'Prof. Meera Iyer',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Pro Vice-Chancellor',
    department: 'Academic Affairs & Board',
  },
  admin: {
    userId: 'usr_suresh_04',
    displayName: 'Dr. Suresh Kumar',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Registrar & Admin',
    department: 'University Administration',
  },
  ops: {
    userId: 'usr_ops_05',
    displayName: 'DevOps / Platform Operator',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Platform Operator',
    department: 'Cloud Infrastructure',
  },
  all: {
    userId: 'usr_demo_admin',
    displayName: 'CampusConnect Admin (All Roles)',
    locale: 'en',
    groups: ['student', 'workbench', 'exec', 'admin', 'ops'],
    roleTitle: 'Super Administrator',
    department: 'CampusConnect Central',
  },
};

const STORAGE_KEY = 'campusconnect:active_role';

interface SessionState {
  readonly session: Session | null;
  readonly loading: boolean;
  readonly signOut: () => Promise<void>;
  readonly switchRole: (role: RouteGroup | 'all') => void;
}

const SessionContext = createContext<SessionState | null>(null);
const SESSION_KEY = ['auth', 'session'] as const;

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();

  const query = useQuery<Session | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        const remote = await apiRequest<Session>('/auth/session');
        return remote;
      } catch (error) {
        // If unauthenticated on server or running in local frontend demo mode, check local storage
        const savedRole = localStorage.getItem(STORAGE_KEY) as (RouteGroup | 'all') | null;
        if (savedRole && DEMO_PROFILES[savedRole]) {
          return DEMO_PROFILES[savedRole];
        }
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        // Fallback default in dev mode if network unavailable
        return DEMO_PROFILES.student;
      }
    },
  });

  const signOut = useCallback(async () => {
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout in demo mode
    }
    localStorage.removeItem(STORAGE_KEY);
    queryClient.clear();
    queryClient.setQueryData(SESSION_KEY, null);
  }, [queryClient]);

  const switchRole = useCallback((role: RouteGroup | 'all') => {
    localStorage.setItem(STORAGE_KEY, role);
    const demo = DEMO_PROFILES[role];
    queryClient.setQueryData(SESSION_KEY, demo);
  }, [queryClient]);

  const value = useMemo<SessionState>(
    () => ({ session: query.data ?? null, loading: query.isPending, signOut, switchRole }),
    [query.data, query.isPending, signOut, switchRole],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
