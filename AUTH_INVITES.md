# Invite-only authentication

Merzal AI is **invite-only**: only accounts provisioned in Supabase can sign in.
There is no public self-signup.

## How it works

- The app calls `signInWithOtp({ shouldCreateUser: false })`, so an OTP/magic
  link is **only** sent to accounts that already exist. Unknown emails get
  “That account isn’t invited yet.”
- `Continue with Google` works for users whose Google email already exists as a
  Supabase user (enable **Disable signups** in the dashboard to enforce this for
  OAuth too).
- A trigger on `auth.users` auto-creates the `user_profiles` row, so an invited
  user lands on the one-time Setup screen, then the app.

## Inviting a user (admin)

**Dashboard:** Authentication → Users → **Invite user** → enter their email.
Supabase emails them a link; clicking it signs them in (the app picks up the
session from the URL automatically).

**API / script** (service-role key, server-side only):

```ts
import { createClient } from '@supabase/supabase-js'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
await admin.auth.admin.inviteUserByEmail('student@college.edu', {
  redirectTo: 'https://your-app-url',
})
```

## Required dashboard settings

1. **Authentication → Providers → Email**: enable; configure SMTP for reliable
   delivery (the built-in mailer is rate-limited).
2. **Authentication → Providers → Google**: add OAuth client ID + secret; add the
   app origin to redirect URLs.
3. **Authentication → Sign In / Providers → “Allow new users to sign up”: OFF**
   (this is what makes Google + OTP truly invite-only).
4. **URL Configuration → Site URL / Redirect URLs**: include the deployed app
   origin so invite links return to the app.

## Phone invites

Phone OTP needs an SMS provider (Twilio/MessageBird) configured in
Authentication → Providers → Phone. Default country in the UI is India (+91).
