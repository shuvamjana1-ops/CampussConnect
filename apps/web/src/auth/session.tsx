import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { isSupabaseConfigured, supabase, type Profile } from '../lib/supabase';

export type UserRole = 'admin' | 'worker' | 'student';
export type RouteGroup = 'student' | 'staff' | 'admin';

export interface LegacySession {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: string | null;
  readonly groups: readonly RouteGroup[];
  readonly roleTitle?: string;
  readonly department?: string;
  readonly rollNumber?: string;
}

// Demo mock profiles for seamless fallback if live Supabase instance is not yet connected
export const DEMO_PROFILES: Readonly<Record<RouteGroup | 'all', LegacySession>> = {
  student: {
    userId: 'usr_ananya_01',
    displayName: 'Ananya Das',
    locale: 'en',
    groups: ['student', 'staff', 'admin'],
    roleTitle: 'Student (B.Tech CSE)',
    department: 'Computer Science & Engineering',
    rollNumber: 'JISU/2024/CSE/0842',
  },
  staff: {
    userId: 'usr_rahul_02',
    displayName: 'Prof. Rahul Mehta',
    locale: 'en',
    groups: ['student', 'staff', 'admin'],
    roleTitle: 'Faculty / Warden',
    department: 'Examination & Records Cell',
  },
  admin: {
    userId: 'usr_suresh_04',
    displayName: 'Dr. Suresh Kumar',
    locale: 'en',
    groups: ['student', 'staff', 'admin'],
    roleTitle: 'Super Administrator',
    department: 'University Administration',
  },
  all: {
    userId: 'usr_admin_all',
    displayName: 'Super Administrator',
    locale: 'en',
    groups: ['student', 'staff', 'admin'],
    roleTitle: 'Super Administrator',
    department: 'Central Administration',
  },
};

// Demo mock profiles for seamless fallback if live Supabase instance is not yet connected
export const DEMO_USERS_MAP: Record<string, { profile: Profile; pass: string }> = {
  'admin@demo.com': {
    profile: {
      id: 'usr-admin-demo-01',
      email: 'admin@demo.com',
      full_name: 'Dr. Suresh Kumar',
      role: 'admin',
      department: 'University Administration & Governance',
      phone: '+91-98300-11223',
      roll_number: 'JISU-ADM-001',
      avatar_url: '/assets/profiles/admin-suresh.svg',
      bio: 'Dean of Academic Affairs & University Registrar. JIS University Administrative Command.',
    },
    pass: 'Admin@123',
  },
  'worker1@demo.com': {
    profile: {
      id: 'usr-worker-demo-01',
      email: 'worker1@demo.com',
      full_name: 'Prof. Rahul Mehta',
      role: 'worker',
      department: 'Examination & Records Cell',
      phone: '+91-98302-34567',
      roll_number: 'JISU-STAFF-104',
      avatar_url: '/assets/profiles/staff-rahul.svg',
      bio: 'Course Evaluator & Exam Superintendent. Department of Computer Science & Engineering.',
    },
    pass: 'Worker@123',
  },
  'worker2@demo.com': {
    profile: {
      id: 'usr-worker-demo-02',
      email: 'worker2@demo.com',
      full_name: 'Er. Dilip Roy',
      role: 'worker',
      department: 'Facilities & Infrastructure Services',
      phone: '+91-98303-45678',
      roll_number: 'JISU-STAFF-208',
      avatar_url: '/assets/profiles/default-avatar.svg',
      bio: 'Chief Facilities Engineer & Estates Maintenance Lead. Campus Infrastructure Division.',
    },
    pass: 'Worker@123',
  },
  'student1@demo.com': {
    profile: {
      id: 'usr-student-demo-01',
      email: 'student1@demo.com',
      full_name: 'Ananya Das',
      role: 'student',
      department: 'Computer Science & Engineering',
      phone: '+91-98301-23456',
      roll_number: 'JISU/2024/CSE/0842',
      avatar_url: '/assets/profiles/student-ananya.svg',
      bio: 'B.Tech CSE 4th Semester student. Campus tech lead & AI researcher. Roll: JISU/2024/CSE/0842.',
    },
    pass: 'Student@123',
  },
  'student2@demo.com': {
    profile: {
      id: 'usr-student-demo-02',
      email: 'student2@demo.com',
      full_name: 'Rohan Sharma',
      role: 'student',
      department: 'Electronics & Communication',
      phone: '+91-98304-56789',
      roll_number: 'JISU/2024/ECE/0155',
      avatar_url: '/assets/profiles/default-avatar.svg',
      bio: 'B.Tech ECE 4th Semester student. Embedded Systems & IoT enthusiast.',
    },
    pass: 'Student@123',
  },
};

const STORAGE_SESSION_KEY = 'campusconnect:mock_session';

interface SessionState {
  readonly user: { id: string; email?: string | undefined } | null;
  readonly profile: Profile | null;
  readonly role: UserRole | null;
  readonly session: LegacySession | null;
  readonly loading: boolean;
  readonly isConfigured: boolean;
  readonly signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  readonly signOut: () => Promise<void>;
  readonly switchRole: (role: RouteGroup | 'all') => void;
  readonly refreshProfile: () => Promise<void>;
  readonly updateProfile: (updates: Partial<Profile>) => Promise<{ success: boolean; error?: string }>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const defaultInitialUser = DEMO_USERS_MAP['student1@demo.com']!.profile;
  const [user, setUser] = useState<{ id: string; email?: string | undefined } | null>({
    id: defaultInitialUser.id,
    email: defaultInitialUser.email,
  });
  const [profile, setProfile] = useState<Profile | null>(defaultInitialUser);
  const [loading, setLoading] = useState(false);

  // Load profile from Supabase by user ID (never trusts user ID from client URL)
  const fetchProfile = useCallback(async (userId: string, email?: string): Promise<Profile | null> => {
    if (!isSupabaseConfigured) {
      if (email && DEMO_USERS_MAP[email.toLowerCase()]) {
        return DEMO_USERS_MAP[email.toLowerCase()]!.profile;
      }
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.warn('Profile fetch note:', error?.message);
        return null;
      }

      return data as Profile;
    } catch (err) {
      console.error('Error fetching profile:', err);
      return null;
    }
  }, []);

  // Initialize Auth state
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        if (isSupabaseConfigured) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            setUser({ id: session.user.id, ...(session.user.email ? { email: session.user.email } : {}) });
            const p = await fetchProfile(session.user.id, session.user.email);
            if (mounted) setProfile(p);
          }
        } else {
          // Check local storage mock session
          const savedMock = localStorage.getItem(STORAGE_SESSION_KEY);
          if (savedMock && mounted) {
            const parsed = JSON.parse(savedMock) as Profile;
            setUser({ id: parsed.id, ...(parsed.email ? { email: parsed.email } : {}) });
            setProfile(parsed);
          } else if (mounted) {
            // Default demo student
            const defaultUser = DEMO_USERS_MAP['student1@demo.com']!.profile;
            setUser({ id: defaultUser.id, ...(defaultUser.email ? { email: defaultUser.email } : {}) });
            setProfile(defaultUser);
          }
        }
      } catch (e) {
        console.warn('Auth initialization error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initAuth();

    // Listen for Supabase auth state changes
    if (isSupabaseConfigured) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser({ id: session.user.id, ...(session.user.email ? { email: session.user.email } : {}) });
          const p = await fetchProfile(session.user.id, session.user.email);
          if (mounted) setProfile(p);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      });

      return () => {
        mounted = false;
        authListener.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, pass: string): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
      setLoading(true);
      const cleanEmail = email.trim().toLowerCase();

      try {
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: pass,
          });

          if (error || !data.user) {
            setLoading(false);
            return { success: false, error: error?.message || 'Authentication failed' };
          }

          setUser({ id: data.user.id, ...(data.user.email ? { email: data.user.email } : {}) });
          const prof = await fetchProfile(data.user.id, data.user.email);
          setProfile(prof);
          setLoading(false);
          return { success: true, role: prof?.role || 'student' };
        } else {
          // Fallback mock check
          const demoUser = DEMO_USERS_MAP[cleanEmail];
          if (demoUser && demoUser.pass === pass) {
            localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(demoUser.profile));
            setUser({ id: demoUser.profile.id, ...(demoUser.profile.email ? { email: demoUser.profile.email } : {}) });
            setProfile(demoUser.profile);
            setLoading(false);
            return { success: true, role: demoUser.profile.role };
          }

          setLoading(false);
          return { success: false, error: 'Invalid credentials. Use demo accounts or connect Supabase.' };
        }
      } catch (err: any) {
        setLoading(false);
        return { success: false, error: err?.message || 'An unexpected error occurred during login.' };
      }
    },
    [fetchProfile],
  );

  const signOut = useCallback(async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      localStorage.removeItem(STORAGE_SESSION_KEY);
      setUser(null);
      setProfile(null);
    } catch (e) {
      console.warn('Sign out error:', e);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const p = await fetchProfile(user.id, user.email);
      setProfile(p);
    }
  }, [fetchProfile, user]);

  const switchRole = useCallback((newRole: RouteGroup | 'all') => {
    if (newRole === 'admin') {
      const demo = DEMO_USERS_MAP['admin@demo.com']!.profile;
      setProfile(demo);
    } else if (newRole === 'staff') {
      const demo = DEMO_USERS_MAP['worker1@demo.com']!.profile;
      setProfile(demo);
    } else {
      const demo = DEMO_USERS_MAP['student1@demo.com']!.profile;
      setProfile(demo);
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Profile>): Promise<{ success: boolean; error?: string }> => {
    if (!profile) return { success: false, error: 'No active profile to update.' };

    const safeUpdates: Record<string, any> = { ...updates };
    delete safeUpdates.role;
    delete safeUpdates.id;

    const merged: Profile = {
      ...profile,
      ...safeUpdates,
    };

    if (isSupabaseConfigured && user?.id) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update(safeUpdates)
          .eq('id', user.id);
        if (error) {
          console.error('Supabase profile update error:', error);
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Database update error' };
      }
    }

    try {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    setProfile(merged);
    return { success: true };
  }, [profile, user]);

  const legacySession: LegacySession | null = {
    userId: user?.id || 'usr_ananya_01',
    displayName: profile?.full_name || 'Ananya Das',
    locale: 'en',
    groups: ['student', 'staff', 'admin'],
    roleTitle: profile?.role === 'admin' ? 'Super Admin' : profile?.role === 'worker' ? 'Faculty / Staff' : 'B.Tech CSE (Student)',
    department: profile?.department || 'Computer Science & Engineering',
    rollNumber: profile?.roll_number || 'JISU/2024/CSE/0842',
  };

  return (
    <SessionContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        session: legacySession,
        loading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signOut,
        switchRole,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
