# Rebrand & ship a new tenant

Everything you need to stand up Merzal AI for a new college or school. Two
moving parts: **the brand** (how it looks/reads) and **the backend** (its own
isolated Supabase project). Nothing else changes between tenants.

---

## TL;DR

```bash
# 1. Backend — one isolated Supabase project per tenant
export SUPABASE_DB_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
export SUPABASE_PROJECT_REF="<ref>"
export ADMIN_ENROLLMENT="975116" ADMIN_PASSWORD="change-me"
bash infra/bootstrap.sh                      # schema + functions + super admin

# 2. Set the model key (server-side secret, never in the browser)
supabase secrets set GEMINI_API_KEY=...  CAMPUS_PROVIDER=gemini  WORLD_PROVIDER=gemini --project-ref <ref>

# 3. Frontend — branded build pointed at that project
docker build -t merzal-<tenant> \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon-key> \
  --build-arg VITE_BRAND_NAME="Riverside University AI" \
  --build-arg VITE_BRAND_ACCENT="#2f6f5e" \
  --build-arg VITE_AUDIENCE=college \
  ./app
docker run -d -p 8080:80 merzal-<tenant>
```

That's a full tenant: isolated DB, its own admin, its own brand.

---

## 1. The brand — one file, three override levels

All brand-y strings/colours live in **`app/src/lib/brand.ts`**. You override it
three ways (later wins):

### a) Edit `brand.ts` and rebuild
Change `name`, `accent`, `audience`, login copy, prompt suggestions, etc. Best
when you maintain a fork per tenant.

### b) Build-time env vars (no code edit)
Bake a tenant identity into a Docker image:

| Build arg | Sets |
|---|---|
| `VITE_BRAND_NAME` | app + AI name, page title |
| `VITE_BRAND_SHORT` | short name in copy |
| `VITE_BRAND_INSTITUTION` | institution label |
| `VITE_BRAND_LOGO_LETTER` | monogram letter |
| `VITE_BRAND_ACCENT` | accent colour (hex) → `--accent` |
| `VITE_AUDIENCE` | `college` \| `school` \| `open` |
| `VITE_BRAND_JSON_URL` | runtime brand JSON (see below) |

### c) Runtime brand JSON (one image → many tenants)
Set `VITE_BRAND_JSON_URL=https://<host>/brand.json`. At boot the app fetches it
and merges over everything. Use the examples in **`infra/brands/`**
(`example-college.json`, `example-school.json`) as templates — copy, edit
name/colour/audience/prompts, host the file, done. No rebuild to re-skin.

> Brand resolution happens **before first paint** (`initBrand()` in `main.tsx`),
> so there's no flash of the default identity.

---

## 2. College vs School vs Open

Set `audience` (in `brand.ts`, env, or brand JSON):

| `audience` | First-login Setup asks | Use for |
|---|---|---|
| `college` | Department + Semester | universities/colleges |
| `school`  | Class + Section | K-12 schools |
| `open`    | nothing (skipped) | general/public deployments |

Component code never changes — `Setup.tsx` reads `brand.audience`.

---

## 3. The backend — isolated per tenant

Each tenant is a **separate Supabase project**, so one college's data can never
touch another's (FERPA). `infra/bootstrap.sh` sets one up:

1. `infra/schema.sql` — all tables, RLS, the `handle_new_user` trigger, seed
   career-guidance row. Idempotent.
2. Edge functions `chat` (LLM gateway) + `phone-auth` (enrollment/password auth,
   admin add/delete) deployed from `supabase/functions/`.
3. `infra/seed_admin.sql` — the first super admin (enrollment + password).

Then set the model secret(s) per project — see the model table in
`supabase/functions/chat/index.ts`. The browser never sees a model key.

---

## 4. Career-guidance knowledge (Campus mode)

Super admin → avatar → **Admin · Manage students** → **Edit career-guidance
knowledge**. Markdown saved there is injected into Campus-mode answers. (RAG via
PageIndex is scaffolded on the `feature/pageindex` branch for later — drop-in,
no chat-UI change.)

---

## 5. Multiple tenants at once

`infra/docker-compose.tenants.yml` runs several branded containers, each on its
own port, each pointed at its own Supabase project. Put Caddy/Traefik in front to
map `riverside.merzal.ai` / `greenwood.merzal.ai` → the right container.

---

## 6. Files map

```
app/src/lib/brand.ts             ← THE rebrand file (defaults + override loader)
infra/schema.sql                 ← full DB bootstrap (one tenant)
infra/seed_admin.sql             ← first super admin
infra/bootstrap.sh               ← schema + functions + admin, one command
infra/brands/example-*.json      ← runtime brand templates (college / school)
infra/docker-compose.tenants.yml ← multi-tenant example
app/Dockerfile                   ← web image (accepts all brand build args)
supabase/functions/chat          ← LLM gateway (provider keys server-side)
supabase/functions/phone-auth    ← auth + admin user management
AUTH_FLOW.md                     ← how login + roster work
```

---

## 7. Backups

Per-tenant `pg_dump` (cron on the host):

```bash
pg_dump "$SUPABASE_DB_URL" -Fc -f "backups/<tenant>-$(date +%F).dump"
# restore into a fresh project:
pg_restore -d "$NEW_DB_URL" --no-owner backups/<tenant>-YYYY-MM-DD.dump
```

Paid Supabase tiers add point-in-time recovery. Keep dumps off-host.
