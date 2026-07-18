-- ════════════════════════════════════════════════════════════════════════
-- Admin system — reconciled with the LIVE database (prior feat/rbac-departments
-- state). Idempotent, safe to re-run.
--
-- Standardizes on the helpers already live: is_admin(), is_super_admin(),
-- my_admin_dept(). Adds is_dept_admin(). Critically, DROPS legacy policies that
-- would otherwise defeat the new per-department scoping (esp. the permissive
-- "anyone read pageindex docs", which let every student read every department's
-- documents and silently broke document RBAC in the AI pipeline).
--
-- Role model (two axes, three effective roles):
--   role='student'                      → Student
--   role='admin', department_id NULL    → Super Admin
--   role='admin', department_id set     → Department Admin (HOD)
-- ════════════════════════════════════════════════════════════════════════

-- ── COLUMNS ──────────────────────────────────────────────────────────────
alter table public.user_profiles add column if not exists section text;
alter table public.user_profiles add column if not exists must_change_password boolean not null default false;
alter table public.user_profiles add column if not exists disabled boolean not null default false;

alter table public.students add column if not exists semester int;

alter table public.pageindex_docs add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.pageindex_docs add column if not exists semester int;
alter table public.pageindex_docs add column if not exists section text;
alter table public.pageindex_docs add column if not exists visibility text not null default 'all';
alter table public.pageindex_docs add column if not exists doc_type text;
alter table public.pageindex_docs add column if not exists effective_date date;
alter table public.pageindex_docs add column if not exists expiry_date date;
alter table public.pageindex_docs add column if not exists tags text[] not null default '{}';

alter table public.audit_log add column if not exists target text;

-- Hot paths at 10k students.
create index if not exists students_dept_sem_sec_idx on public.students (department_id, semester, section);
create index if not exists students_status_idx on public.students (status);
create index if not exists students_name_idx on public.students (lower(name) text_pattern_ops);

-- ── HELPERS ──────────────────────────────────────────────────────────────
-- is_admin(), is_super_admin(), my_admin_dept() already exist on the live DB.
create or replace function public.is_dept_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles p
                 where p.id = auth.uid() and p.role = 'admin' and p.department_id is not null);
$$;

-- ── PRIVILEGE-ESCALATION GUARD ───────────────────────────────────────────
-- The live "own_profile" policy lets a user update their own row; this trigger
-- stops them granting themselves role/department/disabled changes. Service-role
-- writes (edge functions; auth.uid() null) and Super Admins pass.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.department_id is distinct from old.department_id
     or new.disabled is distinct from old.disabled then
    raise exception 'not allowed to change role/department/disabled';
  end if;
  return new;
end; $$;
drop trigger if exists guard_profile_columns on public.user_profiles;
create trigger guard_profile_columns before update on public.user_profiles
  for each row execute function public.guard_profile_columns();

-- Dept Admins may read student profiles in their own department.
drop policy if exists "dept admin reads own dept profiles" on public.user_profiles;
create policy "dept admin reads own dept profiles" on public.user_profiles
  for select using (public.is_dept_admin() and department_id = public.my_admin_dept());

-- ── TEMPORARY KNOWLEDGE (prompt layer; NEVER indexed) ────────────────────
create table if not exists public.temporary_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  department_id uuid references public.departments(id) on delete cascade,  -- NULL = whole campus
  semester int,                       -- NULL = all semesters
  section text,                       -- NULL = all sections
  visibility text not null default 'all' check (visibility in ('students','admins','all')),
  priority int not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.temporary_knowledge enable row level security;
create index if not exists temp_knowledge_live_idx on public.temporary_knowledge (expires_at) where active;

drop policy if exists "super admin manages temp knowledge" on public.temporary_knowledge;
create policy "super admin manages temp knowledge" on public.temporary_knowledge
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "dept admin manages own temp knowledge" on public.temporary_knowledge;
create policy "dept admin manages own temp knowledge" on public.temporary_knowledge
  for all using (public.is_dept_admin() and department_id = public.my_admin_dept())
  with check (public.is_dept_admin() and department_id = public.my_admin_dept());
drop policy if exists "dept admin reads campus temp knowledge" on public.temporary_knowledge;
create policy "dept admin reads campus temp knowledge" on public.temporary_knowledge
  for select using (public.is_dept_admin() and department_id is null);
-- Students read only items targeting them, live, in-window.
drop policy if exists "students read matching temp knowledge" on public.temporary_knowledge;
create policy "students read matching temp knowledge" on public.temporary_knowledge
  for select using (
    active and now() between starts_at and expires_at
    and visibility in ('students','all')
    and exists (
      select 1 from public.user_profiles p where p.id = auth.uid()
        and (temporary_knowledge.department_id is null or temporary_knowledge.department_id = p.department_id)
        and (temporary_knowledge.semester is null or temporary_knowledge.semester = p.semester)
        and (temporary_knowledge.section is null or temporary_knowledge.section = p.section)
    )
  );

-- Caller-scoped fetch used by the chat pipeline. SECURITY DEFINER keyed to
-- auth.uid(): the WHERE clause IS the permission check — nothing from the
-- request can widen it.
create or replace function public.active_temp_knowledge()
returns table (id uuid, title text, content text, priority int, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select tk.id, tk.title, tk.content, tk.priority, tk.expires_at
  from public.temporary_knowledge tk
  join public.user_profiles p on p.id = auth.uid()
  where tk.active
    and now() between tk.starts_at and tk.expires_at
    and (tk.department_id is null or tk.department_id = p.department_id)
    and (tk.semester is null or tk.semester = p.semester)
    and (tk.section is null or tk.section = p.section)
    and (case when p.role = 'admin' then tk.visibility in ('admins','all')
              else tk.visibility in ('students','all') end)
  order by tk.priority desc, tk.expires_at asc
  limit 20;
$$;

create or replace function public.purge_expired_temp_knowledge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.temporary_knowledge where expires_at < now() - interval '7 days';
  get diagnostics n = row_count; return n;
end; $$;

-- ── PAGEINDEX DOCS ───────────────────────────────────────────────────────
-- DROP the legacy permissive read (every signed-in user could read every doc,
-- defeating per-department retrieval scoping) and legacy super-only write.
drop policy if exists "anyone read pageindex docs" on public.pageindex_docs;
drop policy if exists "super admin write pageindex docs" on public.pageindex_docs;
drop policy if exists "students read visible docs" on public.pageindex_docs;
create policy "students read visible docs" on public.pageindex_docs
  for select using (
    visibility in ('students','all')
    and (effective_date is null or effective_date <= current_date)
    and (expiry_date is null or expiry_date >= current_date)
    and exists (
      select 1 from public.user_profiles p where p.id = auth.uid()
        and (pageindex_docs.department_id is null or pageindex_docs.department_id = p.department_id)
        and (pageindex_docs.semester is null or pageindex_docs.semester = p.semester)
        and (pageindex_docs.section is null or pageindex_docs.section = p.section)
    )
  );
drop policy if exists "super admin manages docs" on public.pageindex_docs;
create policy "super admin manages docs" on public.pageindex_docs
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "dept admin manages own docs" on public.pageindex_docs;
create policy "dept admin manages own docs" on public.pageindex_docs
  for all using (public.is_dept_admin() and department_id = public.my_admin_dept())
  with check (public.is_dept_admin() and department_id = public.my_admin_dept());
drop policy if exists "dept admin reads campus docs" on public.pageindex_docs;
create policy "dept admin reads campus docs" on public.pageindex_docs
  for select using (public.is_dept_admin() and department_id is null);

-- ── AUDIT LOG ────────────────────────────────────────────────────────────
-- Super Admin sees everything; a Dept Admin sees only their OWN actions
-- (the legacy admin_read_audit let any admin read the whole college's log).
drop policy if exists "admin_read_audit" on public.audit_log;
drop policy if exists "super admin reads audit log" on public.audit_log;
create policy "super admin reads audit log" on public.audit_log
  for select using (public.is_super_admin());
drop policy if exists "admins read own audit rows" on public.audit_log;
create policy "admins read own audit rows" on public.audit_log
  for select using (public.is_dept_admin() and user_id = auth.uid());
drop policy if exists "admins insert audit rows" on public.audit_log;
create policy "admins insert audit rows" on public.audit_log
  for insert with check ((public.is_super_admin() or public.is_dept_admin()) and user_id = auth.uid());

-- NOTE: students + departments + user_profiles(own_profile, super admin manage)
-- policies from feat/rbac-departments are already correct and are left in place.
