# Merzal AI — Authentication & Roster Flow

> Source of truth for **who can log in** and **how**. Implementation matches this
> doc commit-for-commit; if you change the doc, change the code in the same PR.

---

## Identity model (one line)

A user is **invited** by appearing in `public.students.mobile` (enrollment
number). Until they create a password, `password_set = false`. The first time
they log in, they create it; from then on it's a normal sign-in.

```
public.students  ───────►  auth.users  ───────►  public.user_profiles
 enrollment       (created by    email = <enrollment>@students.merzal.local
 password_set      first login)  password = (set by student)
 user_id ─────────────────────────────────────────►  role (student | admin)
```

There is no public sign-up. Anyone not in `public.students` gets a polite
"not registered" message and that's the end of the road for them.

---

## Roles

| Role | How they get it | What they can do |
|------|-----------------|------------------|
| **student** | Default for every imported enrollment | Chat, memory, share, edit/regenerate |
| **admin** (super admin) | `update public.user_profiles set role='admin'` for that user | Everything a student can + see the **Manage students** page (upload roster, view roster) |

Today's super admin: **enrollment `975116`, password `975116`** (this is the
seed account — change the password from Settings on the first real deployment).

---

## Login flow — every user, every time

```
                     ┌──────────────────────────────┐
                     │  Enter enrollment number      │
                     └──────────────┬───────────────┘
                                    │
                          phone-auth: { action: 'check' }
                                    │
                ┌──────────────┬────┴────┬──────────────────────┐
                │              │         │                      │
        registered=false  registered:true,                registered:true,
                │         hasPassword=false                hasPassword=true
                │              │                               │
                ▼              ▼                               ▼
        "Not registered"  [ Create password ]             [ Enter password ]
        — contact admin    ≥8 chars, letters+digit         signInWithPassword
                                  │                              │
                          phone-auth: { action:                   │
                          'set_password' }                        │
                                  │                              │
                          signInWithPassword                      │
                                  │                              │
                                  ▼                              ▼
                          ┌──────────────────────────────────────┐
                          │   First-login Setup (dept + sem)      │
                          │   — shown once, only if profile       │
                          │   onboarding_done is false            │
                          └──────────────────┬───────────────────┘
                                             │
                                             ▼
                                     ┌────────────────┐
                                     │   Chat app     │
                                     └────────────────┘
```

### What each screen does (frontend)

1. **Enter enrollment** — single text field. Pressing Continue calls the edge
   function `phone-auth` with `{action:'check', enrollment}`. Response time is
   padded to ~120ms so an unregistered enrollment doesn't return faster than a
   registered one (no enumeration timing leak).
2. **Create password** (only when `hasPassword=false`) — password + confirm.
   Client checks min length and letters+digit so the user gets instant feedback;
   the edge function enforces the same rules server-side. On submit:
   - `phone-auth` `set_password` creates the auth user (or sets the password on
     the pre-provisioned one), flips `students.password_set=true`, and links
     `students.user_id`.
   - The client immediately calls `signInWithPassword` with the new credentials.
3. **Enter password** (when `hasPassword=true`) — straight `signInWithPassword`.
   Invalid attempts get a single generic message ("incorrect enrollment or
   password") so an attacker can't tell whether the enrollment exists.
4. **Setup** — runs once per user. After the user fills department + semester
   and submits, `user_profiles.onboarding_done` flips to `true`. Subsequent
   logins skip this entirely.

### Session

Supabase Auth handles the session: a JWT cookie + refresh token in
`localStorage`. Sessions auto-refresh as long as the tab is open; closing the
tab and reopening keeps you signed in unless you sign out. Sign-out is in
**Settings → Account → Sign out**.

---

## Super Admin: how to upload student enrollments

### The roster (one table)

`public.students` is the invite list. RLS allows only `role='admin'` users to
read or modify it.

| column | meaning |
|--------|---------|
| `name` | display name |
| `mobile` | **enrollment number** (kept as the existing column name) |
| `status` | `pending_profile` (default) → `active` (after first login) → `blocked` |
| `password_set` | flips to `true` on first login |
| `user_id` | filled in after first login (links to `auth.users`) |
| `created_at` | when admin added them |

### Admin workflow (UI)

1. Sign in as the super admin (`975116` / `975116`).
2. Open **Settings (sidebar avatar) → 🛠 Admin · Manage students**.
   - This link only appears when `user_profiles.role = 'admin'`.
3. **Upload roster** — click "⬆ Choose file" and pick an `.xlsx` or `.csv`.
   Required columns (case-insensitive, flexible aliases supported):
   - `Student Name` (also matches `name`, `student`)
   - `Mobile Number` / **enrollment number** (also matches `mobile`, `phone`,
     `number`, `contact`)
4. **Preview** — the table shows up to 100 parsed rows (name + cleaned digits).
   - Non-digit characters are stripped from the enrollment.
   - Rows with no enrollment or `<6` digits are dropped.
   - Duplicates within the file are de-duplicated.
5. **Confirm** — click "Import N students". The page calls
   `api.importStudents(rows)`, which does:
   - Server-side filter pass (same rules).
   - `INSERT ... ON CONFLICT (mobile) DO NOTHING` — so re-uploading the same
     file is safe; existing entries are untouched (no password resets, no
     status changes).
   - New rows land as `status='pending_profile'`, `password_set=false`.
6. **Current roster** below the upload shows everyone in the table with their
   status (`pending_profile`, `active`, `blocked`).

### Sample roster (CSV)

```csv
Student Name,Mobile Number
Aarav Patel,21CS001
Diya Sharma,21CS002
Ishaan Verma,21CS003
```

### Edge cases & guarantees

| Situation | What happens |
|-----------|--------------|
| Same enrollment uploaded twice | Skipped — no overwrite, no status change |
| Student already logged in once (`password_set=true`) | Skipped — their password and history are safe |
| Mobile/enrollment formats vary (`+91 98765 43210` vs `9876543210`) | All non-digit chars are stripped; both become `9876543210` |
| Mixed letters+digits enrollment (`21CS042`) | Kept as-is; lowercase + safe-chars-only mapping into the email |
| Removing a student | Currently manual (SQL). UI button for delete/block is a near-term add (see backlog) |

### Provisioning the *first* super admin (bootstrap)

The first super admin can't import themselves — there's no one to do it. Run
once in the Supabase SQL editor:

```sql
-- 1. add the enrollment to the roster
insert into public.students (name, mobile, status, password_set)
  values ('Super Admin', '975116', 'active', false)
  on conflict (mobile) do nothing;

-- 2. let them sign in via the normal "first login" flow once
--    (they create their own password, no temp password needed)

-- 3. after their first login, promote them
update public.user_profiles
   set role = 'admin'
 where id = (select user_id from public.students where mobile = '975116');
```

After that bootstrap, every future admin can be promoted the same way — but
ideally via a **"Promote to admin"** button on the roster page (next backlog
item).

---

## Security guarantees

- **No public sign-up.** A row in `public.students` is the only way to log in.
- **No enrollment enumeration.** `check` runs in constant ~120ms whether or not
  the enrollment exists.
- **Idempotent first password.** `set_password` only succeeds when
  `password_set=false`; a replay returns 409 `already_set`.
- **Server-side strength check.** ≥8 chars, letters + at least one digit, even
  if a client-side check is skipped.
- **Audit trail.** Every `check`, `set_password`, lockout and failure lands in
  `auth_events` (admin-readable).
- **RLS on the roster.** `students` is only readable/writable by admins.
- **Edge function uses service-role internally** but only returns booleans and
  the synthetic email — never tokens; the client mints the session itself.

---

## Backlog (cheap wins, in order)

1. **Roster: Remove / Block / Reset password buttons** per row. (~30 lines)
2. **Promote to admin** button on the roster (so super admins can hand off).
3. **Per-enrollment lockout** — fields exist (`failed_attempts`, `locked_until`),
   wiring is ~20 lines in `signInWithPassword` + a check in `phone-auth`.
4. **Self-serve password reset** — needs SMTP; ship the "forgot password" link
   on the password screen.
5. **HIBP breached-password check** — single Supabase toggle.

These don't change the flow above; they sit on top of it.
