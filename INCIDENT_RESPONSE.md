# Incident response runbook — Merzal AI

Goal: restore chat, protect student data, then write it up. Keep it blameless.

## Severity

| Sev | Meaning | Example |
|---|---|---|
| SEV1 | Data exposure or full outage | RLS bypass, login down for everyone |
| SEV2 | Core feature broken for many | streaming fails for all users |
| SEV3 | Degraded / single feature | one provider down, slow streaming |

## First 10 minutes
1. **Declare** the sev and own it. One coordinator.
2. **Scope**: who/what is affected? Check `get_logs` (api, auth, edge-function) and `get_advisors`.
3. **Stop the bleeding** before root-causing.

## Triage by symptom

**Chat returns errors / no tokens**
- Check `chat` function logs (`get_logs` type `edge-function`).
- Provider outage or bad key? The client auto-falls back to the stub on 501/5xx — confirm users at least get the stub, not a hard error.
- Mitigate: switch the mode's provider to a healthy one — `supabase secrets set CAMPUS_PROVIDER=openai CAMPUS_MODEL=gpt-4o-mini`. Takes effect on next request, no redeploy.

**Login broken**
- Google: check provider config + redirect URLs. Email OTP still works as a fallback path — tell users to use email.
- Supabase Auth logs via `get_logs` type `auth`.

**Suspected data exposure (SEV1)**
1. Run `get_advisors(security)` immediately — look for `rls_disabled` / `rls_enabled_no_policy`.
2. If a table lost its policy, re-enable RLS / re-apply the policy migration **now**.
3. Rotate the anon key only if it was paired with a real RLS gap (anon key alone is safe under RLS).
4. Preserve `audit_log` and function logs for the postmortem.

**Cost spike / abuse**
- Inspect `audit_log` and edge logs for a hot user. Until per-user rate limiting ships (see SECURITY backlog), temporarily unset the provider secret to force the stub, or rotate the leaked upstream key.

## Rollback
- **Frontend**: redeploy the previous `dist/` artifact.
- **Edge function**: redeploy the prior version (note the version id from `list_edge_functions` before each deploy).
- **DB**: apply the down-migration or restore from snapshot. Migrations are forward-only — never hand-edit prod tables mid-incident without recording it.

## After: postmortem (within 48h)
- Timeline, impact, root cause, what detected it, what slowed recovery.
- Action items with owners. File the worst ones into the SECURITY hardening backlog.
