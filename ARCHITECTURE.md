# MerzalLabs Campus AI — Architecture

White-label, on-premises-deployable campus AI assistant. MVP scope: **single
college** (the live Supabase schema is keyed by `college_id`, default `'demo'`).
Multi-tenant (`tenants` table) is a later milestone.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite (`app/`) | Inline-token design system from `Merzal AI.dc.html` |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) | Self-hostable for on-prem; project `merzal ai mvp` (`khjzoboeshgtymijzcaf`) |
| Auth | Supabase Auth — Google OAuth + email/phone OTP | **Open sign-up (MVP), no approval**; trigger auto-creates a profile |
| Vectors | `pgvector` (HNSW, cosine), dim 768 | RAG scaffolded, off for MVP |
| LLM | Backend gateway: `chat` edge function + `src/lib/llm.ts` client | Provider/model chosen server-side per mode; keys are Supabase secrets; stub fallback |

## Data model (RLS on every table)

- `user_profiles` (id→auth.users, college_id, department, semester, role, onboarding_done) — auto-created by an `auth.users` insert trigger
- `chats` (id, user_id, title, bucket, pinned, updated_at)
- `messages` (id, chat_id, user_id, role, content, mode, reaction, created_at)
- `user_memory` (id, user_id, fact) — persistent, user-editable memory
- `kb_documents` / `kb_chunks` (college_id, content, embedding vector(768)) — campus RAG
- `shared_chats` (token, chat_id, user_id) — read-only share links
- `audit_log` (college_id, user_id, action, detail, ts) — FERPA audit trail

**RLS:** chats/messages/memory scoped to `auth.uid()`; KB readable by same-college
users, writable by service role only; audit_log readable by college admins only.

## Frontend structure (`app/src`)

```
lib/
  brand.ts          brand + design tokens (white-label entry point)
  supabase.ts       typed client
  database.types.ts generated DB types
  types.ts          app domain types
  api.ts            data layer (Supabase, RLS-aware)
  llm.ts            pluggable LLM gateway + SSE parser + stub
hooks/
  useConnection.ts  Live / Slow / Offline awareness
components/
  Login, Setup, Sidebar, ChatView, ThinkingIndicator,
  ConnectionPill, Settings, Logo
App.tsx             auth gating → setup → app shell
```

## Signature UX (per spec)

Staged thinking (`Reading → Searching memory → Thinking → Composing` + elapsed
timer + shimmer skeleton) → word-by-word blur-to-sharp reveal → persisted
message. Implemented in `ThinkingIndicator.tsx` + `ChatView.tsx`.

## Milestones

1. ✅ Schema + RLS reconciliation (migrations applied)
2. ✅ Vite scaffold + design system + Supabase client + data layer
3. ✅ Auth UI (Google OAuth + email/phone OTP, open sign-up) + login/setup screens
4. ✅ App shell (sidebar history, search, context menu, settings, connection pill)
5. ✅ SSE streaming + staged thinking/word-reveal (stub until LLM endpoint set)
6. �⏳ Memory extraction + retrieval (manager UI done; auto-extraction pending)
7. ⏳ RAG over `kb_chunks` (schema ready; retrieval/embedding pipeline pending)
8. ✅ Offline queue + slow-connection handling
9. ⏳ White-label theming from tenant config
10. ⏳ Security pass: RLS tests, audit logging hooks, retention, Docker Compose

## LLM gateway (backend-only model choice)

The client never picks a model — users see only the **Campus / World** toggle.
`streamChat({ mode, messages })` calls the `chat` edge function with the user's
JWT. The function:

1. `verify_jwt = true` + re-checks `auth.getUser()` → 401 if unauthenticated.
2. `routeForMode(mode)` reads `CAMPUS_/WORLD_PROVIDER` + `_MODEL` secrets.
3. `resolveProvider()` injects the provider's API key (a secret) and base URL.
4. Proxies the upstream OpenAI-style SSE stream straight back to the browser.

Providers (all OpenAI-compatible, swap via a secret, no redeploy): **OpenAI,
DeepSeek, Gemini, OpenRouter, LiteLLM, vLLM/Ollama**. If no key is set for the
chosen provider the function returns 501 and the client uses a built-in stub —
so the app works with zero keys. Keys never reach the browser.

## Open decisions

- **SSO provider** (SAML vs OIDC) + per-tenant config storage — for institutions that want it on top of Google/OTP.
- **RAG**: embedding model (fixes `kb_chunks.embedding` dim, currently 768) + retrieval wiring into the prompt.
- **Retention policy** — drives a scheduled purge job + `audit_log` retention.
- **Per-user rate limiting** on the `chat` gateway before public rollout.
