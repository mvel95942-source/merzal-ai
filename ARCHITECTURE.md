# MerzalLabs Campus AI — Architecture

White-label, on-premises-deployable campus AI assistant. MVP scope: **single
college** (the live Supabase schema is keyed by `college_id`, default `'demo'`).
Multi-tenant (`tenants` table) is a later milestone.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite (`app/`) | Inline-token design system from `Merzal AI.dc.html` |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) | Self-hostable for on-prem; project `merzal ai mvp` (`khjzoboeshgtymijzcaf`) |
| Auth | Supabase Auth — email/phone OTP + SSO stub | No public sign-up; `allowed_identities` allowlist |
| Vectors | `pgvector` (HNSW, cosine), dim 768 | On-prem bge-base/e5-base embeddings |
| LLM | Pluggable `LLMProvider` (`src/lib/llm.ts`) | Default vLLM/Ollama OpenAI-compatible SSE; built-in stub fallback |

## Data model (RLS on every table)

- `user_profiles` (id→auth.users, college_id, department, semester, role, onboarding_done)
- `allowed_identities` — per-college invite allowlist (service-role only)
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
3. ✅ Auth UI (email/phone OTP + SSO stub) + login/setup screens
4. ✅ App shell (sidebar history, search, context menu, settings, connection pill)
5. ✅ SSE streaming + staged thinking/word-reveal (stub until LLM endpoint set)
6. �⏳ Memory extraction + retrieval (manager UI done; auto-extraction pending)
7. ⏳ RAG over `kb_chunks` (schema ready; retrieval/embedding pipeline pending)
8. ✅ Offline queue + slow-connection handling
9. ⏳ White-label theming from tenant config
10. ⏳ Security pass: RLS tests, audit logging hooks, retention, Docker Compose

## Open decisions

- **SSO provider** (SAML vs OIDC) + per-tenant config storage.
- **LLM endpoint** — set `VITE_LLM_CAMPUS_ENDPOINT` / `VITE_LLM_WORLD_ENDPOINT`.
- **Embedding model** — fixes `kb_chunks.embedding` dimension (currently 768).
- **Retention policy** — drives a scheduled purge job + `audit_log` retention.
