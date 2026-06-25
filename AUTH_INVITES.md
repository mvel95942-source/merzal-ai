# Authentication — roll number + password

Students sign in with their **campus roll number** and a **password**. There is
no public sign-up; accounts are provisioned by the campus admin.

## How it works

- Supabase Auth is email-based, so each roll number maps to a stable synthetic
  email: `<roll>@<VITE_STUDENT_EMAIL_DOMAIN>` (default `students.merzal.local`),
  lower-cased with spaces/punctuation stripped. See `rollToEmail` in `lib/api.ts`.
- The login page collects **Roll number + Password** and calls
  `signInWithPassword`. The app shows the roll number (not the email).
- First login shows the one-time Setup screen (department/semester); a trigger on
  `auth.users` auto-creates the profile row.

## Provisioning students (admin)

Create each user with email = `rollToEmail(roll)` and a password, confirmed.

**API / script** (service-role key, server-side only):

```ts
import { createClient } from '@supabase/supabase-js'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const DOMAIN = 'students.merzal.local' // must match VITE_STUDENT_EMAIL_DOMAIN
const rollToEmail = (roll: string) =>
  `${roll.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${DOMAIN}`

await admin.auth.admin.createUser({
  email: rollToEmail('21CS042'),
  password: 'set-a-strong-temp-password',
  email_confirm: true,
  user_metadata: { roll: '21CS042' },
})
```

Bulk: loop over a roster CSV (roll, temp password) and call `createUser` for each.

## Required dashboard settings

1. **Authentication → Providers → Email**: enabled (password sign-in). SMTP is
   only needed if you later add password-reset emails.
2. **Authentication → Sign In / Providers → “Allow new users to sign up”: OFF** —
   only admin-provisioned roll numbers can sign in.
3. Set `VITE_STUDENT_EMAIL_DOMAIN` in the frontend env to match the script.

## Notes

- Password reset: until a self-serve flow exists, the admin resets via
  `admin.auth.admin.updateUserById(id, { password })`.
- The `Explore a preview` link uses local demo mode (no account) for evaluation.
