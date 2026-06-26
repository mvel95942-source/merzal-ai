# PageIndex integration — design (branch `feature/pageindex`)

## Why this matters

Campus mode today injects a single markdown blob into the system prompt. That
caps at ~6 KB and doesn't actually retrieve — it just stuffs context. PageIndex
gives us **real document RAG over many uploaded files** with **zero extra
code** because:

- their `/chat/completions` is **OpenAI-compatible**, and
- it already routes through their MCP / retrieval over your indexed docs.

So Campus mode flips from "stuff a markdown into the prompt" to "call PageIndex
with the user's question — it retrieves and answers from indexed docs."

## What PageIndex actually gives us (probed live)

```
POST /tree             multipart  index a document (returns tree)
POST /doc              multipart  index a document
POST /markdown         multipart  index markdown
GET  /docs             list indexed documents (paginated)
GET  /doc/{id}         status
DELETE /doc/{id}       delete document
POST /retrieval        run retrieval over indexed docs (RAG primitive)
POST /chat/completions OpenAI-compatible chat that already uses retrieval
GET/POST /mcp          MCP proxy — for agent frameworks (later)
POST /folder           workspaces (group documents per college later)
```

Auth: `Authorization: Bearer <PAGEINDEX_API_KEY>`. Same key works for every
endpoint.

## Architecture

```
       ┌─────────────────────────────────────────────┐
       │ User in Campus mode                          │
       └──────────────────┬──────────────────────────┘
                          │ POST /chat/completions
                          │ (PageIndex base URL)
              ┌───────────▼───────────┐
              │ PageIndex API          │
              │  • runs retrieval      │
              │  • streams OpenAI SSE  │
              └───────────┬───────────┘
                          │
                ┌─────────▼────────────┐
                │ Admin-uploaded docs   │
                │  PDF / DOCX / MD …    │
                │  via Admin → Knowledge│
                └──────────────────────┘
```

### Two flips, both small

1. **`lib/llm.ts`** — when `mode === 'campus'` AND `PAGEINDEX_API_KEY` is set,
   send the OpenAI-style request to `https://api.pageindex.ai/chat/completions`
   instead of Gemini, with the PageIndex bearer. The existing SSE parser works
   because the response shape is identical.
2. **Admin panel** — extend the career-guidance editor to a **Knowledge
   sources** tab that lets the super admin upload PDFs/MD into PageIndex
   (`POST /doc`), list them (`GET /docs`), and delete (`DELETE /doc/{id}`).

That's it. World mode keeps using Gemini directly.

## Where the key lives (security)

- **Production**: as a **Supabase secret** consumed by the `chat` edge function.
  The frontend never sees it.
- **Preview / dev**: `VITE_PAGEINDEX_API_KEY` in `.env.local` (gitignored). The
  frontend calls PageIndex directly only in preview mode, mirroring how Gemini
  works today.

The branch keeps the key out of git via `.env.local`. The scaffolded code uses
`import.meta.env.VITE_PAGEINDEX_API_KEY` and a feature flag
`VITE_PAGEINDEX_ENABLED=true` so merging this branch without setting the key
falls back to the existing CampusKnowledgeProvider (markdown stuffing).

## Per-college scaling

Use PageIndex **folders/workspaces** (`POST /folder`) as the per-college tenant:
each college's docs live in its own folder, queried by folder id. When we move
to multi-tenant Supabase (separate projects per college), each college's
edge-function secret holds *its* PageIndex key. No app-code changes.

## What's deliberately deferred

- **Streaming through PageIndex** — confirmed `chat/completions` exists; need
  to verify `stream:true` SSE shape matches Gemini. If they batch, fall back to
  non-streaming with a "Thinking…" indicator.
- **MCP proxy mode** (`/mcp`) — only useful when we switch to an agent
  framework. Not now.
- **Block references / metadata schemas** — nice for citations later.

## Rollout

1. Land this branch with the scaffold disabled by default (no behaviour change).
2. Set `VITE_PAGEINDEX_API_KEY` + `VITE_PAGEINDEX_ENABLED=true` in `.env.local`.
3. Upload a few college PDFs via the admin "Knowledge sources" tab.
4. Switch to Campus mode → ask about the uploaded docs → it retrieves and
   answers.
5. After verification, set the same as Supabase secrets for production.
