# infra/ — production deploy & multi-tenant bootstrap

One folder with everything to stand up Merzal AI for a new college/school.

| File | What it does |
|------|--------------|
| `schema.sql` | Full DB bootstrap for one tenant — tables, RLS, `handle_new_user` trigger, seed row. Idempotent. |
| `seed_admin.sql` | Creates the first super admin (enrollment + password). |
| `bootstrap.sh` | One command: schema → deploy edge functions → seed admin. |
| `brands/example-college.json` | Runtime brand template (Department + Semester onboarding). |
| `brands/example-school.json` | Runtime brand template (Class + Section onboarding). |
| `docker-compose.tenants.yml` | Example: two branded web containers, separate Supabase projects. |

Edge functions live in `../supabase/functions/` (`chat`, `phone-auth`) and are
deployed by `bootstrap.sh`.

**Start here → [`../REBRAND.md`](../REBRAND.md)** for the full walkthrough.

## Quick start

```bash
export SUPABASE_DB_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
export SUPABASE_PROJECT_REF="<ref>"
export ADMIN_ENROLLMENT="975116" ADMIN_PASSWORD="change-me"
bash infra/bootstrap.sh
```
