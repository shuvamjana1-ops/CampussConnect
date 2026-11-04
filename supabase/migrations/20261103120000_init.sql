-- ==============================================================================
-- CAMPUSCONNECT / HACKATHON SUPABASE SCHEMA & RLS MIGRATION
-- Secure by Default: Profiles, Tasks, Work Items, RBAC & Storage Isolation
-- ==============================================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff', 'student')) default 'student',
  avatar_url text,
  department text,
  created_at timestamptz not null default now()
);

-- Index for fast lookup
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);

-- 2. HELPER FUNCTION (SECURITY DEFINER to avoid RLS recursion)
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 3. AUTO-CREATE PROFILE TRIGGER ON AUTH.USERS
-- Security rule: New signups ALWAYS get role 'student'.
-- Role is NEVER read from client-supplied user_metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    'student',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. TRIGGER TO PREVENT USERS FROM CHANGING THEIR OWN ROLE
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if public.get_my_role() <> 'admin' then
      raise exception 'Security Violation: Only administrators can modify role assignments';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_role on public.profiles;
create trigger trg_protect_role
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- 5. WORK & TASK TABLES
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null default 'General',
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  status text not null check (status in ('pending', 'in_progress', 'completed', 'cancelled')) default 'pending',
  assigned_worker_id uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_owner on public.tasks(owner_id);
create index if not exists idx_tasks_status on public.tasks(status);

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  details text not null,
  status text not null check (status in ('draft', 'submitted', 'reviewed', 'approved')) default 'submitted',
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_items_owner on public.work_items(owner_id);

-- Auto-update updated_at on tasks
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES - SECURE BY DEFAULT
-- ==============================================================================

-- Enable RLS on ALL tables
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.work_items enable row level security;

-- PROFILES POLICIES:
-- Users can SELECT only their own profile. Admin can SELECT all profiles.
drop policy if exists "Profiles select isolation" on public.profiles;
create policy "Profiles select isolation"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or public.get_my_role() = 'admin'
  );

-- Users can UPDATE only their own profile (trigger also ensures role cannot be modified). Admin can update all.
drop policy if exists "Profiles update isolation" on public.profiles;
create policy "Profiles update isolation"
  on public.profiles
  for update
  using (
    auth.uid() = id
    or public.get_my_role() = 'admin'
  )
  with check (
    public.get_my_role() = 'admin'
    or (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()))
  );

-- Allow profile creation for self or admin
drop policy if exists "Profiles insert policy" on public.profiles;
create policy "Profiles insert policy"
  on public.profiles
  for insert
  with check (
    auth.uid() = id
    or public.get_my_role() = 'admin'
  );

-- Only admin can delete profiles
drop policy if exists "Profiles delete policy" on public.profiles;
create policy "Profiles delete policy"
  on public.profiles
  for delete
  using (public.get_my_role() = 'admin');

-- TASKS POLICIES:
-- Strict Isolation: Owner can access their own tasks; Admin can access all.
-- Students cannot see staff tasks; Workers cannot see student or peer tasks.
drop policy if exists "Tasks select isolation" on public.tasks;
create policy "Tasks select isolation"
  on public.tasks
  for select
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Tasks insert isolation" on public.tasks;
create policy "Tasks insert isolation"
  on public.tasks
  for insert
  with check (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Tasks update isolation" on public.tasks;
create policy "Tasks update isolation"
  on public.tasks
  for update
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  )
  with check (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Tasks delete isolation" on public.tasks;
create policy "Tasks delete isolation"
  on public.tasks
  for delete
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

-- WORK_ITEMS POLICIES:
-- Strict Isolation: Owner can access their own work items; Admin can access all.
drop policy if exists "Work items select isolation" on public.work_items;
create policy "Work items select isolation"
  on public.work_items
  for select
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Work items insert isolation" on public.work_items;
create policy "Work items insert isolation"
  on public.work_items
  for insert
  with check (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Work items update isolation" on public.work_items;
create policy "Work items update isolation"
  on public.work_items
  for update
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  )
  with check (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

drop policy if exists "Work items delete isolation" on public.work_items;
create policy "Work items delete isolation"
  on public.work_items
  for delete
  using (
    owner_id = auth.uid()
    or public.get_my_role() = 'admin'
  );

-- ==============================================================================
-- 7. STORAGE BUCKET & FOLDER RESTRICTION POLICIES
-- ==============================================================================

-- Create secure storage bucket for user uploads
insert into storage.buckets (id, name, public)
values ('user-vault', 'user-vault', false)
on conflict (id) do nothing;

-- Restrict storage: Each user can only access folder named with their own auth.uid()
drop policy if exists "Storage user folder select" on storage.objects;
create policy "Storage user folder select"
  on storage.objects
  for select
  using (
    bucket_id = 'user-vault'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.get_my_role() = 'admin'
    )
  );

drop policy if exists "Storage user folder insert" on storage.objects;
create policy "Storage user folder insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'user-vault'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.get_my_role() = 'admin'
    )
  );

drop policy if exists "Storage user folder update" on storage.objects;
create policy "Storage user folder update"
  on storage.objects
  for update
  using (
    bucket_id = 'user-vault'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.get_my_role() = 'admin'
    )
  );

drop policy if exists "Storage user folder delete" on storage.objects;
create policy "Storage user folder delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'user-vault'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.get_my_role() = 'admin'
    )
  );

