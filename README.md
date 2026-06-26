# Merzal AI

A private, white-label AI assistant for **colleges and schools**. Mobile-first,
invite-only, streaming chat with two modes:

- **Campus** — answers grounded in admin-uploaded campus knowledge (career
  guidance, policies, deadlines). PageIndex/GraphRAG drops in here next.
- **World** — general assistant.

The model behind both modes is a server-side decision — users never pick it.

### 🌐 Live demo

**[merzal-ai.vercel.app](https://merzal-ai.vercel.app)** — sign in with
enrollment `975116` / password `975116` (seed super admin).

---

## What's in the box

| Feature | Where |
|---|---|
| Enrollment + password auth, **first-login password create** | `phone-auth` edge function, `Login.tsx` |
| Super admin panel — manual add, bulk Excel/CSV import, Supabase-style delete-with-confirmation, career-guidance markdown | `AdminImport.tsx` |
| Streaming Markdown + LaTeX chat with edit/regenerate, copy, share, thumbs ± with DB-backed feedback | `ChatView.tsx`, `Markdown.tsx` |
| Conversation memory (session) + persistent per-user memory | `memory.ts` |
| Public share links with **"Continue in your account"** | `SharedView.tsx`, `ShareSheet.tsx` |
| File / image / camera upload, real Gemini vision | `attachments.ts` |
| Campus / World mode pill inside the composer (Claude-style) | `ChatView.tsx` |
| Per-mode model fallback chain (Gemma 4 31B → Gemini 2.5 Flash → 2.0 Flash) | `chat` edge function |
| White-label rebrand — one file, three override levels (defaults / env / runtime JSON) | `lib/brand.ts`, `REBRAND.md` |
| College / School / Open audience flag drives onboarding | `Setup.tsx` |
| Per-tenant deploy in one command | `infra/bootstrap.sh` |
| Docker multi-tenant, Vercel one-click | `app/Dockerfile`, `infra/docker-compose.tenants.yml`, `vercel.json` |

---

## Repo layout

```
app/                       React + TypeScript + Vite frontend
  src/lib/brand.ts         ← rebrand source of truth (see REBRAND.md)
  src/lib/                 supabase, llm, memory, knowledge, attachments
  src/components/          Login, Setup, ChatView, Sidebar, Admin*, Shared*
supabase/functions/
  chat/                    LLM gateway (provider keys server-side)
  phone-auth/              enrollment + password auth, admin user mgmt
infra/                     production deploy — schema, bootstrap, brands, compose
  schema.sql               full DB bootstrap for a fresh tenant (idempotent)
  bootstrap.sh             schema → deploy fns → seed admin (one command)
  seed_admin.sql           first super admin
  brands/                  runtime brand JSON examples
  docker-compose.tenants.yml
vercel.json                Vercel hosting config
_legacy/                   original prototype mockup + dc-runtime (kept for reference)
_backups/                  timestamped snapshots of the prototype
```

### Docs map

- **[REBRAND.md](REBRAND.md)** — ship a new college/school in one command
- **[AUTH_FLOW.md](AUTH_FLOW.md)** — login + roster, single source of truth
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design
- **[SECURITY.md](SECURITY.md)** — model + audit
- **[DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)** — pre-ship gate
- **[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)** — runbook
- **[NEXT_SESSION_PLAN.md](NEXT_SESSION_PLAN.md)** — what's queued

---

## Run locally

```bash
cd app && npm install
cp .env.example .env.local        # fill Supabase URL + anon (or use the live project)
npm run dev                       # http://localhost:5173
```

No LLM key locally → built-in stub streams a canned reply. Add
`VITE_GEMINI_API_KEY=…` to `.env.local` for real answers in dev.

---

## Ship a new tenant (10 minutes)

```bash
# 1. Backend — one isolated Supabase project per college
export SUPABASE_DB_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"
export SUPABASE_PROJECT_REF="<ref>"
export ADMIN_ENROLLMENT="975116" ADMIN_PASSWORD="change-me"
bash infra/bootstrap.sh

# 2. Frontend — branded build, deployed to Vercel/Docker/your host
npx vercel deploy --prod           # uses app/.env.production
# OR
docker build -t merzal-<tenant> \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon-key> \
  --build-arg VITE_BRAND_NAME="Riverside University AI" \
  --build-arg VITE_BRAND_ACCENT="#2f6f5e" \
  --build-arg VITE_AUDIENCE=college \
  ./app
```

See **[REBRAND.md](REBRAND.md)** for the full walkthrough and multi-tenant
examples.

---

## LLM provider switching (no frontend change)

Set Supabase secrets — the `chat` edge function reads them and routes:

```bash
supabase secrets set GEMINI_API_KEY=... CAMPUS_PROVIDER=gemini WORLD_PROVIDER=gemini \
  CAMPUS_MODEL=gemma-4-31b-it,gemini-2.5-flash WORLD_MODEL=gemma-4-31b-it,gemini-2.5-flash \
  --project-ref <ref>
```

`CAMPUS_MODEL`/`WORLD_MODEL` can be a comma-separated fallback chain — the gateway
tries each on 429/5xx. Supported: OpenAI, DeepSeek, Gemini/Gemma, OpenRouter,
LiteLLM, vLLM/Ollama (on-prem).
