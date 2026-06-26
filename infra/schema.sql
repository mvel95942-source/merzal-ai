-- ════════════════════════════════════════════════════════════════════════
-- Merzal AI — full database bootstrap for ONE tenant (one college/school).
--
-- Run this once against a fresh Supabase project. Idempotent: safe to re-run.
-- Creates every table, RLS policy, and the auth trigger the app relies on.
--
--   psql "$SUPABASE_DB_URL" -f infra/schema.sql
--   (or paste into the Supabase SQL editor)
--
-- After this, deploy the edge functions and seed a super admin — see
-- infra/bootstrap.sh and infra/seed_admin.sql.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

-- ── PROFILES ────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  college_id text not null default 'default',
  department text,
  semester int,
  role text not null default 'student',          -- student | admin
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "own profile" on public.user_profiles;
create policy "own profile" on public.user_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- New auth user → auto-create their profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── STUDENT ROSTER (admin-managed invite list) ──────────────────────────
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null unique,                    -- the enrollment number
  status text not null default 'pending_profile', -- pending_profile | active | blocked
  user_id uuid,
  password_set boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.students enable row level security;
drop policy if exists "admins manage students" on public.students;
create policy "admins manage students" on public.students for all
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── OTP / first-login (service-role only; no policies) ───────────────────
create table if not exists public.otp_codes (
  mobile text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 0,
  last_sent_at timestamptz not null default now()
);
alter table public.otp_codes enable row level security;

-- ── AUTH AUDIT ───────────────────────────────────────────────────────────
create table if not exists public.auth_events (
  id bigserial primary key,
  mobile text,
  event text not null,
  detail jsonb not null default '{}',
  ts timestamptz not null default now()
);
alter table public.auth_events enable row level security;
drop policy if exists "admins read auth events" on public.auth_events;
create policy "admins read auth events" on public.auth_events for select
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── CHATS / MESSAGES (owner-scoped) ──────────────────────────────────────
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  title text,
  bucket text not null default 'Today',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chats enable row level security;
drop policy if exists "own chats" on public.chats;
create policy "own chats" on public.chats for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role text not null,
  content text not null,
  mode text,
  reaction text,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── MEMORY ───────────────────────────────────────────────────────────────
create table if not exists public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);
alter table public.user_memory enable row level security;
drop policy if exists "own memory" on public.user_memory;
create policy "own memory" on public.user_memory for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── FEEDBACK ─────────────────────────────────────────────────────────────
create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  chat_id uuid,
  message_id uuid,
  type text not null,           -- up | down
  comment text,
  created_at timestamptz not null default now()
);
alter table public.message_feedback enable row level security;
drop policy if exists "own feedback" on public.message_feedback;
create policy "own feedback" on public.message_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── SHARING (public read once shared) ────────────────────────────────────
create table if not exists public.shared_chats (
  token text primary key,
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shared_chats enable row level security;
drop policy if exists "own shares" on public.shared_chats;
create policy "own shares" on public.shared_chats for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "public read share tokens" on public.shared_chats;
create policy "public read share tokens" on public.shared_chats for select using (true);
drop policy if exists "public read shared chat" on public.chats;
create policy "public read shared chat" on public.chats for select using (id in (select chat_id from public.shared_chats));
drop policy if exists "public read shared messages" on public.messages;
create policy "public read shared messages" on public.messages for select using (chat_id in (select chat_id from public.shared_chats));

-- ── CAMPUS KNOWLEDGE (career guidance; admin writes, all read) ───────────
create table if not exists public.campus_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.campus_knowledge enable row level security;
drop policy if exists "anyone read campus knowledge" on public.campus_knowledge;
create policy "anyone read campus knowledge" on public.campus_knowledge for select using (auth.uid() is not null);
drop policy if exists "admins write campus knowledge" on public.campus_knowledge;
create policy "admins write campus knowledge" on public.campus_knowledge for all
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'));
insert into public.campus_knowledge (title, content)
  select 'Career guidance', '# Career guidance' || chr(10) || chr(10) || '_Add your campus guidance here. Markdown supported._'
  where not exists (select 1 from public.campus_knowledge);

-- ── RAG SCAFFOLD (kb_documents / kb_chunks) — off until wired ────────────
create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  college_id text not null default 'default',
  title text not null,
  source text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.kb_documents enable row level security;
drop policy if exists "admins manage kb docs" on public.kb_documents;
create policy "admins manage kb docs" on public.kb_documents for all
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  college_id text not null default 'default',
  content text not null,
  embedding extensions.vector(768),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.kb_chunks enable row level security;
drop policy if exists "read kb chunks" on public.kb_chunks;
create policy "read kb chunks" on public.kb_chunks for select using (auth.uid() is not null);

-- ── FERPA AUDIT LOG ──────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id bigserial primary key,
  college_id text not null default 'default',
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  ts timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "admins read audit log" on public.audit_log;
create policy "admins read audit log" on public.audit_log for select
  using (exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin'));
