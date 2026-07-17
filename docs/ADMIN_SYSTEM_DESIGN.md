# Merzal AI — Administration System Design

**Status:** implemented on branch `feat/admin-system` (schema migration, `admin` edge
function, chat-pipeline RBAC + temporary knowledge, modular admin panel).
**Audience:** engineers deploying Merzal to a new college and future maintainers.

This is not an ERP. The AI chat is the product; the admin system exists to control
**authentication, authorization, AI knowledge, and campus data** — nothing else.

---

## 0. Assumptions challenged (read this first)

The brief asked for a few things that a Staff+ review should push back on:

1. **"Design refresh tokens."** Don't build your own. Supabase Auth already issues
   short-lived JWT access tokens (1h) with rotating one-time refresh tokens, secure
   storage, and revocation on sign-out/ban. Rolling our own token service adds a
   critical-path security component with zero product upside. We *configure* it
   (token TTL, refresh reuse-interval) instead of building it.

2. **"Three roles."** Stored as **two** role values + one scoping column, which is
   deliberately better than a 3-value enum:
   - `role='student'` → Student
   - `role='admin', department_id=NULL` → Super Admin
   - `role='admin', department_id=<uuid>` → Department Admin (HOD)

   Why: "which department an admin governs" is *data*, not a role. A 3-value enum
   still needs `department_id` for HODs, and then permits the nonsense state
   `dept_admin + NULL dept`. The two-axis model makes invalid states unrepresentable
   and keeps every RLS predicate a one-liner (`is_super_admin()`, `admin_dept()`).

3. **"Permission enforcement before RAG."** Agreed — and we go further: enforcement
   lives in **three stacked layers**, so a bug in one is not a breach:
   - Postgres **RLS** on every table (works even if an edge function is buggy),
   - **edge-function guards** for privileged actions (service-role writes),
   - the chat pipeline **filters knowledge server-side by the caller's profile
     loaded from the DB**, never from the request body or the prompt.
   The prompt is *never* a security boundary.

4. **"Bulk export."** Ships, but gated to admins and audited — a 10k-row student
   export is the single most privacy-sensitive operation in the system (FERPA/DPDP).

5. **One college = one Supabase project** (current `infra/bootstrap.sh` model) stays.
   For "hundreds of colleges" this is the right isolation unit: a tenant leak is
   impossible by construction, noisy neighbours don't exist, and per-college data
   residency is trivial. A shared multi-tenant cluster is a cost optimisation to
   revisit at ~50+ tenants (see §10).

---

## 1. System architecture

Modular services with clear interfaces. Each box is independently replaceable.

```
                 ┌───────────────────────────────────────────────┐
                 │              React SPA (Vite, PWA)            │
                 │  ┌───────────────┐      ┌──────────────────┐  │
                 │  │  Student Chat │      │  Admin Panel     │  │
                 │  │  (ChatView)   │      │  (#/admin/* SPA) │  │
                 │  └───────┬───────┘      └────────┬─────────┘  │
                 └──────────┼───────────────────────┼────────────┘
                            │ JWT (Supabase session)│
             ┌──────────────▼───────────────────────▼─────────────┐
             │                Supabase (per college)              │
             │                                                    │
             │  AUTH SERVICE          Supabase Auth (GoTrue)      │
             │   sessions, refresh rotation, bcrypt, bans         │
             │                                                    │
             │  EDGE FUNCTIONS (Deno)                             │
             │   phone-auth  — pre-auth: check / set_password     │
             │   admin       — privileged account lifecycle       │
             │   chat        — AI gateway (RBAC → knowledge → LLM)│
             │   pageindex-upload — doc ingestion → PageIndex     │
             │                                                    │
             │  POSTGRES + RLS (single source of truth for authz) │
             │   user_profiles · students · departments           │
             │   temporary_knowledge · pageindex_docs             │
             │   chats · messages · feedback · audit_log          │
             └──────────────┬─────────────────────────────────────┘
                            │ server-side only (secrets never in browser)
              ┌─────────────▼──────────────┐   ┌────────────────────┐
              │  PageIndex (permanent      │   │  LLM providers      │
              │  knowledge index/retrieval)│   │  DeepSeek → Gemma → │
              │  tree search over doc index│   │  Gemini (fallback)  │
              └────────────────────────────┘   └────────────────────┘
```

Module boundaries (each has one interface, swappable independently):

| Module | Interface | Implementation today |
|---|---|---|
| Authentication | `phone-auth` fn + Supabase Auth | enrollment→synthetic email, bcrypt via GoTrue |
| Account lifecycle | `admin` fn (JSON actions) | service-role, RBAC-guarded, audited |
| Student management | PostgREST + RLS, `admin` fn for privileged ops | direct table access, scoped by RLS |
| Document management | `pageindex-upload` fn + `pageindex_docs` metadata | PageIndex indexing |
| Temporary knowledge | `temporary_knowledge` table + RLS + RPC | **no indexing — prompt layer only** |
| AI retrieval | `chat` fn pipeline | temp-knowledge merge → PageIndex tree search |
| Analytics | `admin_analytics` RPC | SQL aggregates, admin-gated |
| Audit | `audit_log` + `auth_events` tables | insert-only, triggers + fn writes |

---

## 2. Database schema

Implemented in `supabase/migrations/20260717100000_admin_system.sql` (idempotent,
also folded into `infra/schema.sql` for fresh tenants). Key tables:

```sql
departments (id uuid PK, name text, code text UNIQUE, created_at)

user_profiles (
  id uuid PK → auth.users,
  role text CHECK (role IN ('student','admin')) DEFAULT 'student',
  department_id uuid → departments,   -- NULL for Super Admin / unassigned student
  semester int, section text,
  must_change_password boolean DEFAULT false,   -- set by admin reset
  disabled boolean DEFAULT false,
  onboarding_done boolean, created_at
)

students (                            -- the roster: exists before the auth user
  id uuid PK, name text,
  mobile text UNIQUE,                 -- enrollment / register number
  status text CHECK (IN ('pending_profile','active','blocked')),
  user_id uuid,                       -- linked at first sign-in
  department_id uuid → departments,
  semester int, section text, year int,
  password_set boolean, failed_attempts int, locked_until timestamptz,
  created_at
)
-- Indexes for 10k+ rows: (department_id, semester, section), (status), (name text_pattern_ops)

temporary_knowledge (                 -- NEVER indexed; prompt layer only
  id uuid PK,
  title text, content text,
  department_id uuid NULL,            -- NULL = whole campus
  semester int NULL, section text NULL,  -- NULL = all
  visibility text CHECK (IN ('students','admins','all')) DEFAULT 'all',
  priority int DEFAULT 0,             -- higher first in the prompt
  starts_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,    -- hard expiry, nothing lives forever
  active boolean DEFAULT true,
  created_by uuid, created_at, updated_at
)
-- Partial index: (expires_at) WHERE active — the hot query is "active & unexpired now"

pageindex_docs (                      -- permanent-knowledge metadata (PageIndex holds content)
  id uuid PK, doc_id text,            -- PageIndex document id
  name text, status text,
  department_id uuid NULL, semester int NULL, section text NULL,
  visibility text CHECK (IN ('students','admins','all')) DEFAULT 'all',
  doc_type text,                      -- timetable | syllabus | notes | policy | circular
  effective_date date NULL, expiry_date date NULL,
  tags text[] DEFAULT '{}',
  created_at
)

audit_log (id bigserial, college_id, actor uuid, action text, target text,
           detail jsonb, ts)          -- insert-only; who did what to whom
auth_events (mobile, event, detail, ts)  -- pre-auth telemetry (OTP/login attempts)
```

**RLS helper functions** (STABLE, SECURITY DEFINER, used by every policy):

```sql
is_super_admin()  → role='admin' AND department_id IS NULL
is_dept_admin()   → role='admin' AND department_id IS NOT NULL
admin_dept()      → the caller's department_id
```

**Policy matrix** (enforced by Postgres, not by the UI):

| Table | Student | Dept Admin | Super Admin |
|---|---|---|---|
| students | — | CRUD rows where `department_id = admin_dept()` (WITH CHECK pins the dept, so they cannot move students out/in) | CRUD all |
| temporary_knowledge | SELECT only rows targeting them, active, in time window | CRUD own-dept rows (+read campus-wide) | CRUD all |
| pageindex_docs | SELECT rows visible to them | CRUD own-dept docs | CRUD all |
| departments | SELECT | SELECT | CRUD |
| user_profiles | own row (cannot change role/department_id — column guard trigger) | read own-dept student profiles | all |
| audit_log | — | SELECT own-dept actions | SELECT all |
| chats/messages/memory | own rows only | own rows only | own rows only (privacy: admins do NOT read student chats) |

---

## 3. API endpoints

Three surfaces. Everything else is PostgREST + RLS (no bespoke CRUD API to maintain).

### 3.1 `phone-auth` (pre-auth, anon key, rate-limited)
| Action | Body | Behaviour |
|---|---|---|
| `check` | `{enrollment}` | → `{registered, hasPassword}` — drives the login screen |
| `set_password` | `{enrollment, password}` | first-login password creation; strength-checked; creates auth user |

### 3.2 `admin` (JWT required; caller's profile loaded from DB; every action audited)
| Action | Who | Behaviour |
|---|---|---|
| `reset_password` | Super any · Dept own-dept | sets a temp password, flags `must_change_password` |
| `disable_account` | same scoping | `students.status='blocked'` + GoTrue ban (kills refresh) |
| `enable_account` | same scoping | unblock + unban |
| `move_department` | **Super only** | cross-dept move (dept admins can't reach outside their dept) |
| `set_semester_section` | Super any · Dept own-dept | batch semester/section update |
| `promote_admin` | **Super only** | make a user Dept Admin (with dept) or Super (no dept) |
| `demote_admin` | **Super only** | back to student; cannot demote self |

### 3.3 `chat` (JWT required; the AI gateway — see §6)

Client-side data access (PostgREST via supabase-js, RLS-scoped): students list/
search/import, departments, temporary knowledge CRUD, doc metadata, audit reads,
`admin_analytics()` RPC.

---

## 4. Authentication flow

Students sign in with **enrollment number + password** (mapped to a synthetic email
`<enrollment>@students.merzal.local` because GoTrue is email-keyed).

```
┌────────── LOGIN ──────────┐
Enrollment ▸ [check] ──────▸ not registered → "contact your department"
     │ registered, no password
     ▼
First-login password create ▸ [set_password] ▸ auto sign-in
     │ registered, has password
     ▼
Password ▸ supabase.auth.signInWithPassword
     │ success                                │ failure
     ▼                                        ▼
profile.disabled? ──yes──▸ signed out + notice     counter++ / lockout
     │ no
profile.must_change_password? ──yes──▸ FORCED CHANGE screen (cannot skip)
     │ no                                   │ updateUser({password}) → clear flag
     ▼                                      ▼
   Chat  ◂─────────────────────────────────┘
```

- **Session handling / refresh:** Supabase-managed. Access JWT ~1h; refresh tokens
  rotate on every use (reuse detection revokes the family). Client auto-refreshes.
- **Logout:** `supabase.auth.signOut()` revokes the refresh token server-side.
- **Password hashing:** bcrypt inside GoTrue. We never see or store plaintext.
- **Change password (voluntary):** Settings → current session → `auth.updateUser`.
- **Forgot password:** these are minors/students with no real email on file — so the
  flow is *"ask your Department Admin"*. Dept Admin hits `reset_password`, hands the
  student a temp password out-of-band, and the forced-change screen rotates it on
  first login. No email/SMS infrastructure required, no phishable reset links.
- **Force change after reset:** `must_change_password` on the profile; App gates on
  it before rendering chat.
- **Disable:** GoTrue ban (`ban_duration`) — immediately invalidates refresh; plus
  `students.status='blocked'` so pre-auth `check` refuses early.
- **Scoping:** Dept Admins can reset/disable only students whose
  `students.department_id = admin_dept()` — checked in the `admin` fn against the
  DB row, not against anything the client sent.

## 5. Authorization flow (every request)

```
Request → JWT verified (Supabase)
        → caller profile loaded FROM DB (role, department_id, semester, section)
        → route guard:
            table ops   → RLS policies (Postgres)          ← cannot be bypassed
            admin fn    → explicit scope check vs target row
            chat fn     → knowledge filters built from profile (§6)
        → action → audit_log
```

The client's claims about itself are never trusted: `department_id` etc. always come
from `user_profiles`/`students` rows the server reads itself.

---

## 6. AI request lifecycle (token-optimised)

```
User question
  ↓ 1 Authentication      chat fn verifies JWT (no session → 401)
  ↓ 2 RBAC + metadata     ONE query: profile (role, dept, semester, section, disabled)
  ↓ 3 Temporary knowledge ONE indexed query: active, now within [starts_at, expires_at],
  │                       scope matches (dept/sem/section NULL-or-equal, visibility),
  │                       ORDER BY priority DESC, LIMIT 20, ~2k char budget
  │                       → merged into the system prompt as "Campus updates"
  ↓ 4 Permanent knowledge PageIndex tree search — but only over docs whose metadata
  │                       the caller may see (dept/sem/section/visibility/date window
  │                       filter on pageindex_docs BEFORE any retrieval call)
  │                       tree (titles+summaries) → LLM picks node_ids → only those
  │                       nodes' text is pulled (never the whole document)
  ↓ 5 Merge context       system prompt = base + temp-knowledge block + doc sections
  ↓ 6 LLM                 DeepSeek V4 Flash → Gemma → Gemini fallback chain, streaming
  ↓ 7 Response            SSE stream to client
```

Token economics:
- Temporary knowledge is a **bounded prompt block** (≤20 items, ≤~500 tokens). It
  costs zero indexing and zero embedding — exactly what short-lived facts deserve.
- Permanent knowledge only ever contributes the *selected tree nodes*, not documents.
- The doc tree + doc-id lists are cached in-function (10-min TTL); per-user filtering
  happens on the cached rows, so steps 3–4 add ~2 cheap DB round-trips.
- Expired temp knowledge disappears from queries instantly (time predicate) and is
  garbage-collected by a scheduled purge — no index rebuild, no cost.

**Security invariant:** if a student asks "show me the admin circular", nothing
admin-scoped is ever *retrieved*, so it cannot leak — the model can't reveal context
it never received. Prompt instructions are UX, not security.

---

## 7. Admin panel — UX architecture (ASCII wireframes)

A proper SaaS dashboard at `#/admin/…` — persistent left nav, one module per route,
no long scrolling page. Dept Admins see only the modules that apply to them.

```
┌──────────┬───────────────────────────────────────────────────────────┐
│ MERZAL   │  Dashboard                                     ⌂ Su Admin │
│ ADMIN    ├───────────────────────────────────────────────────────────┤
│          │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│ ▸ Dash   │  │ 9,842   │ │ 20      │ │ 47      │ │ 12      │          │
│ ▸ Studen │  │ students│ │ depts   │ │ documents│ │ live    │          │
│ ▸ Docs   │  └─────────┘ └─────────┘ └─────────┘ │ updates │          │
│ ▸ Updates│                                      └─────────┘          │
│ ▸ Admins │  Quick actions:  [+ Student] [+ Update] [⇪ Import]        │
│ ▸ Depts  │  Recent admin activity ─────────────────────────────      │
│ ▸ Analyt │   10:02  reset_password  CSE/9741..  by HOD-CSE           │
│ ▸ System │   09:48  doc uploaded    "Sem6 TT"   by superadmin        │
│ ▸ Audit  │                                                           │
└──────────┴───────────────────────────────────────────────────────────┘

STUDENTS — built for 10,000 rows: server-side search + filters + paging
┌──────────┬───────────────────────────────────────────────────────────┐
│ …nav…    │ Students          [Search 🔍______] [Dept ▾][Sem ▾][Sec ▾] │
│          │ [⇪ Import Excel] [⇩ Export] [+ Add]         [Status ▾]    │
│          │ ┌─┬──────────────┬─────────┬────┬───┬────────┬──────────┐ │
│          │ │☑│ Name         │ Reg no  │Dept│Sem│ Status │ Actions  │ │
│          │ │☐│ Priya S      │ 975116  │CSE │ 6 │ active │ ⟲ 🔒 ⋯   │ │
│          │ │☐│ Arun K       │ 975117  │CSE │ 6 │ blocked│ ⟲ 🔓 ⋯   │ │
│          │ └─┴──────────────┴─────────┴────┴───┴────────┴──────────┘ │
│          │ 2 selected: [Reset passwords] [Disable] [Move dept ▾]     │
│          │                              ◂ 1 2 3 … 197 ▸  50/page     │
└──────────┴───────────────────────────────────────────────────────────┘
   ⟲ reset password (shows temp password once)   🔒/🔓 disable/enable

TEMPORARY KNOWLEDGE — the "announcement" layer (no indexing)
┌──────────┬───────────────────────────────────────────────────────────┐
│ …nav…    │ Temporary updates                      [+ New update]     │
│          │ ┌───────────────────────────────────────────────────────┐ │
│          │ │ ● Lab shifted to Room 305      CSE · Sem 6 · all secs │ │
│          │ │   expires in 6h · priority 5   [Edit] [Deactivate]    │ │
│          │ │ ● Tomorrow is a holiday        Whole campus           │ │
│          │ │   expires tomorrow 6 PM        [Edit] [Deactivate]    │ │
│          │ │ ○ Exam postponed (expired)     ECE · Sem 4            │ │
│          │ └───────────────────────────────────────────────────────┘ │
│          │ New: [Title][Content][Dept ▾][Sem ▾][Sec ▾][Visibility ▾] │
│          │      [Priority][Starts][Expires*]        [Publish]        │
└──────────┴───────────────────────────────────────────────────────────┘

DOCUMENTS — permanent knowledge with targeting metadata
┌──────────┬───────────────────────────────────────────────────────────┐
│ …nav…    │ Documents                     [⇪ Upload PDF]  [Type ▾]    │
│          │ ┌──────────────┬────────┬────┬───┬──────────┬───────────┐ │
│          │ │ Sem 6 TT.pdf │timetable│CSE │ 6 │ students │ indexed ✓ │ │
│          │ │ Policies.pdf │policy   │ALL │ — │ all      │ indexing… │ │
│          │ └──────────────┴────────┴────┴───┴──────────┴───────────┘ │
│          │ Click row → metadata editor (dept/sem/sec/visibility/     │
│          │ doc-type/effective/expiry/tags) — filters retrieval       │
└──────────┴───────────────────────────────────────────────────────────┘
```

**Speed rules:** every module is one route; the three everyday tasks are ≤2 clicks
from anywhere (post an update, find a student, reset a password); bulk actions ride
the selection bar; nothing paginates client-side beyond 50 rows.

## 8. Student UX

Unchanged product: the chat. What students *feel* from this system:

- Sign in with enrollment + password; first login creates the password; a reset
  forces a new one on next login. Disabled accounts can't sign in (and active
  sessions die with the GoTrue ban).
- Campus answers silently respect their scope: a CSE Sem-6 student's "any updates
  for tomorrow?" is answered from *their* temp knowledge + *their* documents.
  No update chooser, no department picker — metadata does the routing.
- Time-sensitive notices arrive inside answers ("Note: tomorrow is a holiday")
  because temp knowledge is merged into every campus-mode prompt while valid.

## 9. Security considerations

- **RLS is the floor.** Every table, deny-by-default; the UI hiding a button is
  cosmetic. Column-guard trigger stops privilege self-escalation via
  `user_profiles` (students can't set their own `role`/`department_id`).
- **Prompt ≠ boundary.** Retrieval filters run before context assembly (§6).
- **Secrets server-side only** (PageIndex/LLM keys are Supabase secrets; verified
  by the existing "strip server-only secrets from client bundle" work).
- **Brute force:** per-account counters + lockout, pre-auth rate limits,
  attempt caps; auth events logged.
- **Disable = revoke:** GoTrue ban invalidates refresh tokens immediately, not
  just at next access-token expiry.
- **Audit:** every privileged action (`admin` fn) writes actor, action, target,
  detail; insert-only; Dept Admins read only their dept's slice.
- **Bulk export** is admin-only and writes an audit row (it's the biggest PII
  event in the system).
- **Temp passwords** are shown once to the admin, never stored in plaintext,
  and are invalidated by forced rotation at first use.
- **CORS/JWT:** all functions verify JWT except pre-auth `phone-auth`, which
  operates only on roster-approved enrollments and is rate-limited.

## 10. Future scalability

| Trigger | Move |
|---|---|
| >50k docs / heavy retrieval | Split AI retrieval into its own service (the `chat` fn already talks to PageIndex behind an interface); add per-dept doc-id sharding of the tree cache |
| >10k students, slow lists | Already server-paginated; add trigram index on name; move exports to an async job |
| Hundreds of colleges | Keep project-per-college; add a control-plane repo (fleet provisioning = today's `bootstrap.sh` behind an API + Terraform); shared observability |
| Temp-knowledge volume | It's a prompt budget, not a scaling problem — cap stays; add per-dept budgets if 20 depts × many notices exceed ~500 tokens |
| Real email/phone on file | Swap "ask your HOD" forgot-password for Supabase's native email reset without touching anything else (auth module boundary) |
| SSO (college Google Workspace) | GoTrue OIDC per tenant; roster linking stays via enrollment field |
| Analytics depth | Move `admin_analytics` aggregates to nightly materialized views once query time is felt |

---

*Implementation entry points:* migration `supabase/migrations/20260717100000_admin_system.sql`,
functions `supabase/functions/admin/`, `supabase/functions/chat/`, UI
`app/src/components/admin/`, client API `app/src/lib/admin.ts`.
