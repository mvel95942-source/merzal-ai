# Deploy checklist — Merzal AI

Run top to bottom before shipping a release. Don't skip the verify column.

## 1. Build & types
- [ ] `cd app && npm ci`
- [ ] `npm run build` passes (tsc + vite, no errors) — _verify: clean exit, `dist/` written_

## 2. Supabase project
- [ ] `VITE_SUPABASE_URL` + anon key set in the frontend env — _verify: login screen loads, no "Supabase not configured"_
- [ ] Schema migrations applied — _verify: `list_migrations` shows latest_
- [ ] `get_advisors(security)` shows no unresolved ERROR/WARN (leaked-password WARN is accepted, OTP/OAuth only)
- [ ] RLS enabled on every public table — _verify: advisors clean_

## 3. Auth
- [ ] Google provider configured (client ID + secret, redirect URLs include the deploy origin) — _verify: "Continue with Google" completes a round-trip_
- [ ] Email OTP sends — _verify: code arrives, login succeeds, new user lands on Setup once_

## 4. LLM gateway (`chat` edge function)
- [ ] Deployed and `ACTIVE` with `verify_jwt = true` — _verify: `list_edge_functions`_
- [ ] Provider secret set for each mode you use (`OPENAI_API_KEY`, etc.) and `CAMPUS_/WORLD_PROVIDER` + `_MODEL`
- [ ] Real streaming works — _verify: send a message, tokens stream; with no key it falls back to the stub, never errors_
- [ ] Unauthorized call returns 401 — _verify: `curl` without a JWT_

## 5. Frontend UX smoke test
- [ ] Login → Setup → New chat → message streams (staged thinking → word reveal)
- [ ] Campus/World toggle is the **only** model control (no provider picker)
- [ ] History list, rename, delete, resume work
- [ ] Connection pill: offline queues messages; reconnect flushes them

## 6. Rollback
- [ ] Previous frontend build artifact retained
- [ ] Edge function previous version id noted (redeploy to roll back)
- [ ] DB migrations are forward-only — have a tested down-migration or a snapshot

See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) if a deploy goes wrong.
