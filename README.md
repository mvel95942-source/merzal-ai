# Merzal AI — Campus AI

A private, white-label AI chat assistant for colleges and schools. Anyone signs
in with **Google or any email**, then chats with a streaming assistant that has
a **Campus** mode (institution-aware) and a **World** mode (general). The model
behind each mode is a backend decision — users never see or pick a model.

> MVP scope: **open sign-up, no approval**, plain chat (no RAG yet), single
> college. The pieces for RAG, multi-tenant, and on-prem are scaffolded but off.

## Layout

```
app/                      React + TypeScript + Vite frontend
  src/lib/                brand/tokens, supabase client, data layer, llm client
  src/components/         Login, Setup, Sidebar, ChatView, Settings, …
supabase/functions/chat/  LLM gateway edge function (provider keys server-side)
Merzal AI.dc.html         design source of truth (mockup)
ARCHITECTURE.md           system design   ·   SECURITY.md   audit + model
DEPLOY_CHECKLIST.md       pre-ship gate    ·   INCIDENT_RESPONSE.md  runbook
```

## Run it locally

```bash
cd app
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key (already set for the MVP project)
npm run dev                  # http://localhost:5173
```

With no LLM key configured the chat streams a **built-in stub** so the full UX
works offline. Add a provider key (below) to stream real answers.

## Plug-and-play: pick the model (backend only)

Keys live as **Supabase secrets** — never in the browser. The `chat` edge
function maps each mode to a provider + model:

```bash
# Per-mode routing (defaults: openai / gpt-4o-mini)
supabase secrets set CAMPUS_PROVIDER=openai   CAMPUS_MODEL=gpt-4o-mini
supabase secrets set WORLD_PROVIDER=deepseek  WORLD_MODEL=deepseek-chat

# Provider credentials — set the ones you use
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set DEEPSEEK_API_KEY=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set LITELLM_BASE_URL=https://your-litellm  LITELLM_API_KEY=...
supabase secrets set VLLM_BASE_URL=http://your-vllm:8000/v1   # on-prem
```

Supported providers (all OpenAI-compatible, switchable by changing a secret):
**OpenAI · DeepSeek · Gemini · OpenRouter · LiteLLM · vLLM/Ollama**. To switch
the model the whole app uses, change `CAMPUS_PROVIDER`/`CAMPUS_MODEL` — no code,
no redeploy of the frontend.

## Enable Google sign-in

In Supabase → Authentication → Providers → Google: add your Google OAuth client
ID + secret, and add the app origin to redirect URLs. Email OTP works out of the
box. See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md).
