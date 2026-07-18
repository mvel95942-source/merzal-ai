# Merzal — Who can see and do what

The decided capability model for the three roles. Enforced in **three layers**:
Postgres RLS (the floor), the `admin` edge function (privileged actions), and the
chat pipeline (knowledge scoping). The UI only *hides* what a role can't do —
hiding is convenience, RLS is the security boundary.

Roles (two axes):
- **Student** — `role='student'`
- **Super Admin** — `role='admin'`, `department_id = NULL`
- **Department Admin (HOD)** — `role='admin'`, `department_id = <their dept>`

## Capability matrix

| Capability | Student | Department Admin | Super Admin |
|---|:---:|:---:|:---:|
| Use the AI chat | ✅ | ✅ | ✅ |
| See admin panel | ❌ | ✅ (scoped) | ✅ (all) |
| **Students** — view / search | ❌ | own department only | all departments |
| Students — add / import | ❌ | into own dept only | any dept |
| Students — export CSV | ❌ | own dept only (audited) | all (audited) |
| Students — reset password | ❌ | own-dept students | anyone |
| Students — disable / enable | ❌ | own-dept students | anyone |
| Students — set semester / section | ❌ | own-dept students | anyone |
| Students — **move between departments** | ❌ | ❌ (cross-dept) | ✅ |
| **Documents** — upload / edit metadata | ❌ | own dept (+ read campus-wide) | all |
| Documents — delete | ❌ | own dept | all |
| **Temporary updates** — post / edit | ❌ | own dept (+ read campus-wide) | any dept + campus-wide |
| **Departments** — create / delete | ❌ | ❌ (read-only, for pickers) | ✅ |
| **Department Admins** — promote / demote | ❌ | ❌ | ✅ |
| **Analytics** (campus-wide) | ❌ | ❌ | ✅ |
| **Audit logs** | ❌ | own actions only | everything |
| **System** info | ❌ | ❌ | ✅ |

## What a student can retrieve from the AI
- Temporary updates whose scope matches their department / semester / section,
  are active, within their time window, and visible to students.
- Documents whose metadata matches them (department / semester / section /
  visibility / effective+expiry dates). **A student never retrieves another
  department's documents or admin-only material** — filtered server-side before
  retrieval, so the model never even receives it.

## What logs every move
`audit_log` records every privileged action taken through the `admin` edge
function and bulk data events — actor, action, target, detail, timestamp; it is
insert-only. Currently logged: `reset_password`, `disable_account`,
`enable_account`, `move_department`, `set_semester_section`, `promote_admin`,
`demote_admin`, `import_students`, `export_students`. Super Admin sees the whole
log (Audit module); a Department Admin sees only their own actions.

Auth-level events (login attempts, OTP, lockouts) are recorded separately in
`auth_events`.

## Deliberate boundaries (the "why")
- **HODs cannot cross departments.** Moving a student in/out of a department, or
  posting a campus-wide notice, is inherently cross-department — Super Admin only.
  Enforced by RLS `WITH CHECK` *and* re-checked in the `admin` function.
- **Admins do not read student chats.** `chats`/`messages` stay owner-only for
  everyone, including Super Admin — analytics are aggregate counts, never content.
- **No self-escalation.** A DB trigger blocks any non-super user from changing
  their own `role` / `department_id` / `disabled`, even though they can edit their
  own profile row.
