// Merzal AI — LLM gateway edge function.
//
// The model choice is a BACKEND decision. The client sends only the mode
// (campus | world); this function maps that mode to a provider + model from
// server-side config, holds every provider API key as a Supabase secret (keys
// never reach the browser), verifies the caller's Supabase JWT, then proxies an
// OpenAI-compatible streaming chat completion back as Server-Sent Events.
//
// Per-mode routing (secrets/config — set what you use):
//   CAMPUS_PROVIDER / CAMPUS_MODEL    (defaults: openai / gpt-4o-mini)
//   WORLD_PROVIDER  / WORLD_MODEL     (defaults: openai / gpt-4o-mini)
// Provider credentials (set the ones your providers need):
//   OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY,
//   LITELLM_BASE_URL + LITELLM_API_KEY, VLLM_BASE_URL (+ optional VLLM_API_KEY)
//
// Deploy:  supabase functions deploy chat   (or via MCP)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.0-flash',
  openrouter: 'openai/gpt-4o-mini',
  litellm: 'gpt-4o-mini',
  vllm: 'llama3',
}

// Map a chat mode to the provider + model the admin configured for it.
function routeForMode(mode: string): { provider: ProviderId; model: string } {
  const prefix = mode === 'world' ? 'WORLD' : 'CAMPUS'
  const provider = (Deno.env.get(`${prefix}_PROVIDER`) as ProviderId) || 'openai'
  const model = Deno.env.get(`${prefix}_MODEL`) || DEFAULT_MODEL[provider] || 'gpt-4o-mini'
  return { provider, model }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ProviderId = 'openai' | 'deepseek' | 'gemini' | 'openrouter' | 'litellm' | 'vllm'

interface Upstream {
  base: string
  key?: string
  extraHeaders?: Record<string, string>
}

function resolveProvider(p: ProviderId): Upstream | { error: string } {
  const env = (k: string) => Deno.env.get(k) ?? ''
  switch (p) {
    case 'openai':
      return env('OPENAI_API_KEY')
        ? { base: 'https://api.openai.com/v1', key: env('OPENAI_API_KEY') }
        : { error: 'OPENAI_API_KEY not set' }
    case 'deepseek':
      return env('DEEPSEEK_API_KEY')
        ? { base: 'https://api.deepseek.com/v1', key: env('DEEPSEEK_API_KEY') }
        : { error: 'DEEPSEEK_API_KEY not set' }
    case 'gemini':
      return env('GEMINI_API_KEY')
        ? { base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: env('GEMINI_API_KEY') }
        : { error: 'GEMINI_API_KEY not set' }
    case 'openrouter':
      return env('OPENROUTER_API_KEY')
        ? {
            base: 'https://openrouter.ai/api/v1',
            key: env('OPENROUTER_API_KEY'),
            extraHeaders: { 'HTTP-Referer': 'https://merzal.ai', 'X-Title': 'Merzal AI' },
          }
        : { error: 'OPENROUTER_API_KEY not set' }
    case 'litellm':
      return env('LITELLM_BASE_URL')
        ? { base: env('LITELLM_BASE_URL').replace(/\/$/, ''), key: env('LITELLM_API_KEY') }
        : { error: 'LITELLM_BASE_URL not set' }
    case 'vllm':
      return env('VLLM_BASE_URL')
        ? { base: env('VLLM_BASE_URL').replace(/\/$/, ''), key: env('VLLM_API_KEY') }
        : { error: 'VLLM_BASE_URL not set' }
    default:
      return { error: `unknown provider ${p}` }
  }
}

function systemPrompt(mode: string, context: string): string {
  const base =
    mode === 'campus'
      ? "You are a private campus assistant running on the university's own infrastructure. Be concise, helpful, and accurate. Ground answers in the provided campus context when present and make clear the data stays on campus."
      : 'You are Merzal AI, a helpful, concise assistant.'
  const multimodal =
    ' When the user attaches images or files, read them and reference their contents directly in your answer.'
  return context ? `${base}${multimodal}\n\nContext:\n${context}` : `${base}${multimodal}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // ── AuthN: require a valid Supabase user ──────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  // `content` is `string | OpenAIPart[]` — when the user attached images, the
  // client sends multimodal parts. Pass it through verbatim.
  let body: { mode?: string; context?: string; messages: { role: string; content: unknown }[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const { mode = 'campus', context = '', messages } = body
  if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'messages required' }, 400)

  // Backend decides which provider + model serves this mode.
  const { provider, model } = routeForMode(mode)
  const up = resolveProvider(provider)
  if ('error' in up) return json({ error: up.error }, 501) // 501 → client uses stub

  const payload = {
    model,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt(mode, context) }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
  }

  let upstream: Response
  try {
    upstream = await fetch(`${up.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(up.key ? { Authorization: `Bearer ${up.key}` } : {}),
        ...(up.extraHeaders ?? {}),
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return json({ error: `upstream fetch failed: ${e}` }, 502)
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    return json({ error: `upstream ${upstream.status}`, detail: detail.slice(0, 500) }, 502)
  }

  // Pipe the upstream SSE stream straight back to the client.
  return new Response(upstream.body, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
