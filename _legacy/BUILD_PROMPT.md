# MerzalLabs Campus AI — Claude Code Build Prompt

> Paste everything below the line into Claude Code. Start it in **plan mode** (`/plan` or shift-tab) so it produces an implementation plan you approve *before* it writes code. The UI design lives in `Merzal AI.dc.html` in this project — open it alongside as the visual source of truth.

---

You are building **MerzalLabs Campus AI**: a white-label, secure, **on-premises** AI assistant that universities deploy on their own servers. Each college gets its own branded instance ("Riverside University AI", etc.) that knows *that* college's courses, policies, deadlines, and campus info. Student/staff data never leaves the institution. Think ChatGPT/Gemini-quality chat UX, but private, branded, and campus-aware.

**Work in plan mode first.** Produce a complete plan — architecture, schema, file tree, milestones, and open questions — and wait for my approval before writing any code. Do not scaffold until the plan is approved.

## Product requirements

1. **Auth** — Sign in with university **email or phone number** (OTP), plus **university SSO** (SAML/OIDC) as the primary path. No public sign-up; accounts are provisioned per tenant.
2. **Streaming chat** — Assistant replies stream token-by-token (Server-Sent Events). The waiting state is a designed, staged experience, not a spinner: status phases (*Reading your message → Searching memory → Thinking → Composing*) with an elapsed timer, a shimmer skeleton that resolves into text, then a word-by-word blur-to-sharp reveal. Match `Merzal AI.dc.html`.
3. **Persistent memory** — Durable facts about the user (major, advisor, reminders preference) are extracted from conversations into a separate, user-editable memory store and retrieved into the prompt on each turn. Users can view, edit, and clear memory in Settings.
4. **Chat history** — Conversations persist server-side, listed in a sidebar, resumable, renameable, deletable. "New chat" starts fresh.
5. **Campus knowledge (RAG)** — Each tenant has a private knowledge base (course catalog, academic calendar, policies, dining/facilities feeds). Retrieve relevant chunks per query and ground answers in them. Answers cite that the data is the college's own and stays on campus.
6. **Connection awareness** — A live connection pill (Live / Slow / Offline). Offline: messages **queue locally** and send on reconnect — never silently fail. Slow: warn that streaming may lag, degrade gracefully.
7. **White-label / multi-tenant** — Per-tenant brand: name, logo/monogram, accent color, optional SSO config. Resolved by subdomain or deploy config. The UI in `Merzal AI.dc.html` is the default theme (warm paper, terracotta accent, Newsreader + Hanken Grotesk + JetBrains Mono); tenants override tokens.
8. **Security & compliance** — On-premises deployable, **FERPA-aware**: data isolation per tenant, encryption at rest/in transit, audit logging, no third-party data egress, configurable retention. Document the security model.

## Stack

- **Frontend:** React + TypeScript + Vite. Inline-token design system matching the mockup. Responsive: desktop sidebar + main; mobile collapses the sidebar into a drawer.
- **Backend / data:** **self-hosted Supabase** (Postgres + Auth + Realtime + Storage) so the whole stack runs on the university's own infrastructure — no managed cloud dependency. Use Supabase Auth for email/phone OTP and SSO; Postgres + `pgvector` for memory and RAG embeddings; Row Level Security for per-user/per-tenant isolation.
- **Model serving:** pluggable LLM gateway. Default to a self-hostable inference endpoint (e.g. vLLM / Ollama-compatible) so models run on-prem; abstract behind a `LLMProvider` interface so a tenant can swap in their approved model. Stream via SSE.
- **Embeddings:** on-prem embedding model into `pgvector`.

## Data model (Postgres, RLS on every table)

- `tenants` (id, slug, name, brand_json, sso_config)
- `users` (id, tenant_id, email, phone, role)
- `conversations` (id, tenant_id, user_id, title, created_at, updated_at)
- `messages` (id, conversation_id, role, content, status, created_at)
- `memories` (id, tenant_id, user_id, text, source_message_id, created_at)
- `kb_documents` / `kb_chunks` (tenant_id, content, embedding vector, metadata) — campus knowledge base
- `audit_log` (tenant_id, user_id, action, ts) — FERPA audit trail

## Build order (milestones)

1. Schema + RLS + tenant resolution + seed one demo tenant ("Riverside University").
2. Auth (email/phone OTP + SSO stub) and the branded login screen.
3. App shell: sidebar (history, new chat, settings), responsive drawer, connection pill.
4. Send/receive with **SSE streaming** + the staged thinking/skeleton/word-reveal UI.
5. Conversation persistence + history list + resume/rename/delete.
6. Memory extraction + retrieval + Settings memory manager.
7. RAG over the tenant knowledge base, grounded + on-prem-private answers.
8. Offline queue + slow-connection handling.
9. White-label theming from `tenants.brand_json`.
10. Security pass: RLS tests, audit logging, retention config, deployment docs (Docker Compose for on-prem).

## UI direction (non-negotiable — no generic "AI slop")

Replicate `Merzal AI.dc.html` exactly: warm paper background, single confident terracotta accent, Newsreader serif for display, Hanken Grotesk body, JetBrains Mono for technical labels. **User messages are right-aligned bubbles; assistant replies are full-width on the left with an avatar + name + timestamp**, ChatGPT/Gemini-style. Generous spacing, calm, editorial. The thinking/streaming sequence is the signature moment — build it faithfully.

## Deliverables from your plan

- Architecture diagram (text), final schema, file tree, env/secrets list, and Docker Compose sketch for on-prem deploy.
- A list of decisions you need from me (SSO provider, model endpoint, retention policy).

Confirm the plan with me before writing code.
