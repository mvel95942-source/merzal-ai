# Security model & audit — Merzal AI

_Last audited: 2026-06-24 (MVP: open sign-up, plain chat, single college)._

## Trust model

| Layer | Control |
|---|---|
| Auth | Supabase Auth — Google OAuth + email/phone OTP. No passwords stored by the app. |
| Sign-up | **Open** by design for the MVP — anyone with a Google/email account is in. No approval gate. |
| Per-user isolation | Row Level Security on every public table; users can only read/write rows where `user_id = auth.uid()`. |
| LLM keys | Held only as Supabase **secrets**, read inside the `chat` edge function. Never shipped to the browser. |
| Model choice | Backend-only (`CAMPUS_/WORLD_PROVIDER` + `_MODEL`). The client cannot select a provider or override a model. |
| Gateway authZ | `chat` runs with `verify_jwt = true` **and** re-validates the caller with `auth.getUser()` before any upstream call. Unauthenticated → 401. |

## Audit findings (Supabase advisors)

- ✅ `rls_enabled_no_policy` — **resolved**: dropped the now-unused `allowed_identities` table.
- ⚠️ `auth_leaked_password_protection` — **N/A / accepted**: the app uses OTP + OAuth only; no password login surface exists. Enable it anyway if you later add password auth.

## Manual review

- **RLS coverage** — `chats`, `messages`, `user_memory`, `user_profiles`, `shared_chats`, `kb_*`, `audit_log` all have RLS enabled with owner-scoped policies. Verify after any schema change with `get_advisors`.
- **Edge function** — input validated (`messages` required, JSON guarded); upstream errors are not leaked verbatim (truncated to 500 chars); CORS is `*` for the static frontend (tighten to your origin in production).
- **Secrets** — no API key, service-role key, or provider token appears in `app/` or the client bundle. Confirmed `grep` of `src/` finds none.
- **Browser exposure** — only `VITE_SUPABASE_URL` and the **anon** key reach the client; both are safe to expose (RLS enforces access).

## Hardening backlog (post-MVP)

1. Restrict `Access-Control-Allow-Origin` to the deployed origin(s).
2. Per-user rate limiting on `chat` (e.g. token bucket in Postgres) to cap cost/abuse.
3. Tenant isolation (`college_id` in every policy) before multi-college rollout.
4. Audit-log writes from the edge function for each completion (FERPA trail).
5. Retention job for `messages`/`user_memory` per institution policy.
