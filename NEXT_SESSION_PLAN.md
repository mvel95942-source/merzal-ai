# Next session plan — Merzal AI

Ordered by value × readiness. Each section: scope, approach, definition of done.

---

## 1. PageIndex / Vectify RAG for Campus mode  ★ branch-ready

**Status:** scaffolded on `feature/pageindex` (see `PAGEINDEX_INTEGRATION.md`).
The OpenAI-compatible `POST /chat/completions` on PageIndex already retrieves
over indexed docs — we just swap the URL.

**To finish & merge:**
- Admin → **Knowledge sources** tab (PDF upload, list, delete via `/doc`).
- Per-college isolation via `/folder` (workspace) once we go multi-tenant.
- Verify SSE shape matches `streamOpenAISSE` end-to-end in the browser.
- Move the key to a Supabase secret + edge-function route (no `VITE_*` in prod).

**Done:** admin uploads a campus PDF, switches to Campus mode, asks a question
about it, gets a grounded answer streamed token-by-token.

---

## 2. Multi-college: one codebase, one DB per college  ★ headline

**Goal:** spin up Merzal AI for a new college in **under 10 minutes** by
running one command, with a *separate* Supabase project so data is isolated.

### Architecture

```
        college-A.merzal.ai          college-B.merzal.ai
                ▼                            ▼
        ┌──────────────┐            ┌──────────────┐
        │   web app    │            │   web app    │   ← same code, different env
        └──────┬───────┘            └──────┬───────┘
               │ VITE_SUPABASE_URL=…A      │ VITE_SUPABASE_URL=…B
               ▼                            ▼
        ┌──────────────┐            ┌──────────────┐
        │ Supabase A   │            │ Supabase B   │   ← separate projects
        │  + auth      │            │  + auth      │      → FERPA-isolated data
        │  + edge fns  │            │  + edge fns  │
        └──────────────┘            └──────────────┘
```

### Pieces

- **`infra/schema.sql`** — frozen migration bundle that bootstraps a fresh
  Supabase project (tables, RLS, triggers, seed admin). Generated from current
  migrations + applied once per new college.
- **`infra/functions/*`** — `chat` + `phone-auth` Deno bundles ready to deploy
  via `supabase functions deploy`.
- **`infra/bootstrap.sh`** — given `SUPABASE_URL`, `SERVICE_ROLE_KEY`,
  `ADMIN_ENROLLMENT`, `ADMIN_PASSWORD`, runs the schema + deploys functions +
  seeds the super admin. Idempotent.
- **`Dockerfile`** for the web app (multi-stage Node → static nginx), already
  exists (`docker-compose.yml`). Add per-tenant build args:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BRAND_JSON_URL`.
- **`docker-compose.tenants.yml`** — example with two tenants on different
  subdomains, each pointing at its own Supabase project.

### Done

```bash
bash infra/bootstrap.sh https://abcd.supabase.co $SROLE 24042 admin1234
docker compose up -d   # college-A site live, admin can log in, chat works.
```

---

## 3. Clean rebrand file — single source of truth  ★ already partially in place

Today: `app/src/lib/brand.ts` holds names, accent, login copy, etc. The chat
also has scattered `Merzal AI` strings.

**Goal:** every brand-y string lives in ONE file (`brand.ts`), so a new
deployment edits one file and rebuilds.

- Sweep the codebase for hardcoded `Merzal`, `Campus AI`, the orange `#bf5e36`.
- Move them to `brand.ts`.
- Replace with `brand.name`, `brand.accent`, etc.
- Add a **runtime override**: at boot, if `VITE_BRAND_JSON_URL` is set, fetch
  it and merge over the defaults. Lets each Docker tenant supply its brand at
  runtime without rebuilding.
- README: "to rebrand, edit `brand.ts` OR provide a brand JSON over HTTP."

**Done:** `cp brand.ts → school-A-brand.json`, change name/colour, redeploy.

---

## 4. Per-institution variants — school vs college

**College** (today): Setup screen asks **Department + Semester**.
**School** (new): skip Setup entirely; just `class`/`section`, or skip onboarding.

Mechanism: `brand.ts` gains an `audience: 'college' | 'school' | 'open'` flag
that drives the Setup screen (`Setup.tsx`) and the empty-state copy.

- `college`: current behaviour.
- `school`: skip Setup or show "Class & section" instead of "Department & sem".
- `open`: skip Setup entirely.

**Done:** flip the flag in `brand.ts`, get school-shaped onboarding without
touching component code.

---

## 5. Python FastAPI backend (optional, for performance + future RAG)

**Scope:** mirror the edge-function gateway as a self-hosted FastAPI service
that we run alongside (or instead of) Supabase Edge Functions when colleges
want fully on-prem. JS edge functions stay for managed deployments.

**Why:** Python is the natural home for LangChain / Llama-Index / GraphRAG
work, and lets us co-locate it with vLLM/Ollama for low-latency on-prem.

**Pieces:**
- `backend/` directory: FastAPI + uvicorn, Pydantic models, async PostgreSQL
  client (asyncpg), provider router mirroring `chat` edge function.
- Endpoints: `POST /chat/completions` (OpenAI-style streaming),
  `POST /auth/check`, `POST /auth/set-password`, `POST /auth/admin/*`.
- `backend/Dockerfile`, hook into the per-tenant compose.
- **Plug-and-play model providers**: same `LLMProvider` interface as today,
  in Python.

**Done:** college can run the entire stack on its own VM (Postgres + FastAPI +
vLLM) with the same web frontend.

---

## 6. Doc upload / extraction polish

(Promoted from earlier plans — still pending in the chat composer.)

- PDF/DOCX/XLSX text extraction in the browser (`pdfjs`, `mammoth`, SheetJS).
- Image persistence to Supabase Storage so old chats show thumbnails.
- Production edge-function path forwards `attachments` as `image_url` parts.

**Done:** every file type listed in the composer's "+" menu actually reaches
the model with usable content.

---

## 7. Auth polish (carry-overs)

- **Per-enrollment lockout** — fields are in place; wire into
  `signInWithPassword`.
- **Self-serve password reset** — once SMTP is configured per tenant.
- **HIBP breached-password check** — single Supabase advisor toggle.
- **Promote-to-admin** button in the roster (so the seed admin can hand off).

---

## 8. Operations

- **`/backups`** — daily `pg_dump` of each tenant's Supabase via cron-on-VM,
  plus point-in-time recovery for paid tiers.
- **Health check endpoint** for each edge function (already implicitly via
  Supabase logs — surface to the admin panel).
- **Cost guardrails** — daily token cap per user written into `audit_log`.

---

## Working agreements (per your direction)

- **Plan with Opus, execute with smaller agents.** Use `/batch` / Agent calls
  for mechanical sweeps (string replacement during rebrand, file renaming,
  parser scaffolding). Reserve Opus for design + the integration edges.
- **Branch first for risky work.** PageIndex/Vectify, Python backend, and
  multi-college bootstrap each live on their own branch. Merge to main only
  after a working demo + green build.
- **No silent caps.** When we drop something, log it in this plan file —
  never just remove it from view.

---

## Immediate, picked-one-of:

If you say "go", I'll start with **#1 — finish the PageIndex branch** (admin
knowledge-sources tab + Supabase secret wiring + browser SSE verification),
because it unlocks the Campus-mode value proposition and the work is already
half-done.
