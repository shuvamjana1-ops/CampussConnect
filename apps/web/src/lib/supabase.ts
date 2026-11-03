import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly role: 'admin' | 'worker' | 'student';
  readonly avatar_url?: string | null;
  readonly department?: string | null;
  readonly phone?: string | null;
  readonly roll_number?: string | null;
  readonly bio?: string | null;
  readonly emergency_contact?: string | null;
  readonly semester?: string | null;
  readonly created_at?: string;
}

export interface DbTask {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  readonly assigned_worker_id?: string | null;
  readonly resolution_notes?: string | null;
  readonly attachment_url?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DbWorkItem {
  readonly id: string;
  readonly owner_id: string;
  readonly task_id?: string | null;
  readonly title: string;
  readonly details: string;
  readonly status: 'draft' | 'submitted' | 'reviewed' | 'approved';
  readonly attachment_url?: string | null;
  readonly created_at: string;
}

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

// Fallback dummy URL and anon key for clean build and initial preview before live project connection
const supabaseUrl = envUrl && !envUrl.includes('your-project') ? envUrl : 'https://placeholder-instance.supabase.co';
const supabaseAnonKey = envKey && !envKey.includes('your-anon') ? envKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

export const isSupabaseConfigured = Boolean(
  envUrl && envKey && !envUrl.includes('your-project') && !envKey.includes('your-anon'),
);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

