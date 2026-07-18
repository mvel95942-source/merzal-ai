# Merzal Admin System — Testing Strategy

**Scope:** authentication, RBAC, student management + import, knowledge (permanent
PageIndex + temporary prompt layer), the AI request pipeline, and audit logging.
**Goal:** prove every feature works at a *system* level (real DB, real RLS, real
edge functions) — not just that components render.

## Testing pyramid (what runs where)

| Layer | What it covers | Where |
|---|---|---|
| **Static** | Types + lint — no `any` leaks past the admin cast boundary, no unused code | `tsc -b`, `oxlint` (CI on every push) |
| **RLS policy tests** | The security floor: each role sees exactly its scope | SQL harness (§5), run against a scratch Supabase branch |
| **Edge-function tests** | `admin` action authorization, `chat` gating | Deno test + live smoke (§3) |
| **Functional (manual/E2E)** | Wizard, tables, modals end-to-end in a browser | Preview-driven checklist (§2), verified live |
| **Accessibility** | WCAG 2.1 AA | `docs/A11Y_AUDIT.md` + keyboard/SR pass |

There is no unit-test runner wired into this repo today (Vite + oxlint only).
The highest-value, lowest-cost additions are the **RLS SQL tests** and the
**edge-function authorization tests** — those cover the security-critical logic
that TypeScript cannot. They're specified below ready to drop in.

## 1. Access matrix — the single most important thing to test

"What is accessible to Student / Dept Admin / Super Admin" — enforced by RLS,
so every cell is a testable assertion:

| Resource | Student | Dept Admin (own dept) | Dept Admin (other dept) | Super Admin |
|---|---|---|---|---|
| Own chats/messages/memory | ✅ RW | ✅ RW | ✅ RW | ✅ RW |
| Another user's chats | ❌ | ❌ | ❌ | ❌ (privacy: admins never read student chats) |
| `students` rows | ❌ | ✅ RW own dept | ❌ | ✅ RW all |
| `user_profiles.role/department` (self) | ❌ (trigger blocks) | ❌ | ❌ | ✅ |
| `temporary_knowledge` | ✅ read matching+live only | ✅ RW own dept, read campus | ❌ other dept | ✅ RW all |
| `pageindex_docs` | ✅ read visible only | ✅ RW own dept | ❌ | ✅ RW all |
| `departments` | read | read | read | RW |
| `audit_log` | ❌ | ✅ own actions | ❌ | ✅ all |
| `admin` fn `reset_password` | ❌ 403 | ✅ own-dept student | ❌ 403 forbidden_department | ✅ anyone |
| `admin` fn `move_department` / `promote_admin` | ❌ | ❌ super_admin_only | ❌ | ✅ |
| `chat` when `disabled=true` | ❌ 403 account_disabled | — | — | — |

## 2. Functional test checklist (preview-driven — status verified 2026-07-17)

Legend: ✅ verified live · ⏳ needs migration on live DB first.

**Auth**
- ✅ Login with enrollment + password (seed super admin 975116).
- ⏳ First-login password creation; forced change after admin reset
  (`must_change_password` gate) — needs the profile column live.
- ✅ Logout returns to login; session persists across reload.

**Students**
- ✅ Server-side search (typed "velmu" → 1 row; digits match enrollment).
- ✅ Filters: department / semester / status compose into the query.
- ✅ Pagination (50/page) with live total count (69 in scope).
- ✅ Row selection + bulk bar ("2 selected"); confirm-disable dialog opens,
  is `role=dialog aria-modal`, takes focus, closes on Escape.
- ✅ Add-student modal; ✎ edit (semester/section; dept move for Super).
- ✅ CSV export (audited); formula-injection cells neutralized (§4 fix).

**Import wizard** — end-to-end with a deliberately messy file:
- ✅ Upload → auto-mapped 5 columns → Review showed *1 new, 1 already
  registered (DB dedupe hit the seed admin), 3 problem rows* with correct
  reasons (missing name, unknown department, in-file duplicate).
- ✅ Commit inserts via the un-migrated-DB fallback (verified: 1 inserted,
  test row deleted afterward). Error report + template download.

**Temporary knowledge** — ⏳ table not on live DB yet; New-update form renders
with all targeting fields (dept/sem/section/visibility/priority/start/expiry).

**Documents / Departments / Admins / Audit / Analytics** — ✅ render and read;
document metadata + temp-knowledge writes are ⏳ until the migration runs.

## 3. Edge-function authorization tests (`admin`)

Each is a POST with a role's JWT; assert the status/body. These encode the
security contract — run them after any change to `supabase/functions/admin`:

```
# as Student           → 403 forbidden          (not an admin)
# as Dept Admin CSE, target CSE student, reset_password  → 200 {tempPassword}
# as Dept Admin CSE, target ECE student, reset_password  → 403 forbidden_department
# as Dept Admin,      move_department            → 403 super_admin_only
# as Dept Admin,      promote_admin              → 403 super_admin_only
# as Super Admin,     demote_admin(self)         → 400 cannot_demote_self
# as Super Admin,     disable then enable        → 200; GoTrue ban toggles
# disabled admin (any)                           → 403 forbidden
```

Verify each writes an `audit_log` row (actor, action, target, detail).

## 4. Security regression tests (from the red-team pass)

- **CSV formula injection:** `csvCell('=HYPERLINK(...)')` must return a value
  starting with `'` (single quote); `+ - @`, tab, CR too. Normal names and
  embedded quotes unchanged/escaped.
- **PostgREST filter injection:** `safeSearch('Priya, S)")')` must strip the
  structural characters so the `.or()` filter stays well-formed.
- **RLS boundary:** a Dept Admin cannot `select`/`update` another department's
  `students` row even by crafting the request (RLS `using` + `with check`).
- **Profile escalation:** a student `update user_profiles set role='admin'`
  must fail on the `guard_profile_columns` trigger.

## 5. RLS SQL test harness (drop-in)

Run against a **scratch branch**, never production. Seeds one user per role and
asserts visibility. Pattern:

```sql
-- Impersonate a role by setting the JWT claims RLS reads.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<student-uuid>","role":"authenticated"}';
-- Student must not see the students roster:
select count(*) = 0 as pass from public.students;                 -- expect pass
-- Dept-admin CSE sees only CSE:
set local request.jwt.claims = '{"sub":"<cse-hod-uuid>"}';
select bool_and(department_id = '<cse-uuid>') as pass from public.students;
-- Cross-dept write must be rejected:
-- (expect: new row violates row-level security policy)
insert into public.students(name,mobile,department_id) values ('x','1',' <ece-uuid>');
```

## 6. AI pipeline (PageIndex tree search) test

The `chat` edge function is the integration point. Assert, per campus question:
1. **Auth/disabled gate** runs first (disabled profile → 403, no retrieval).
2. **Temporary knowledge** is fetched via `active_temp_knowledge()` and only
   the caller's scoped, live items appear in the system prompt (≤2k chars).
3. **PageIndex** doc ids come from the caller's RLS-scoped `pageindex_docs`
   read — a student in CSE never receives an ECE-only document's sections.
4. **Tree search**: tree → LLM selects node_ids → only those nodes' text is
   sent (not the whole document). Fallback to full-OCR only if the tree is
   unavailable. Merge order = base prompt → temp knowledge → doc sections.

Manual verification: post a temp update scoped to CSE Sem 6, ask an unrelated
question as a CSE Sem-6 student → the update surfaces; ask as an ECE student →
it does not. (Requires the migration live; see §2 ⏳ items.)

## 7. Pre-deploy gate (every release)

1. `npm run build` (tsc + vite) green, `npm run lint` clean.
2. Functional checklist §2 items that don't need the migration.
3. If the DB migration is included: run §5 RLS harness on a branch first.
4. After deploy: smoke §3 with one real JWT per role; confirm audit rows land.
