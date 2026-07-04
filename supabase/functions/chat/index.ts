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
  aicredits: 'deepseek/deepseek-v4-flash',
}

// Map a chat mode to the provider + model the admin configured for it.
function routeForMode(mode: string): { provider: ProviderId; model: string } {
  const prefix = mode === 'world' ? 'WORLD' : 'CAMPUS'
  // Default to AICredits → DeepSeek V4 Flash; override per mode with
  // CAMPUS_PROVIDER / CAMPUS_MODEL / WORLD_PROVIDER / WORLD_MODEL secrets.
  const provider = (Deno.env.get(`${prefix}_PROVIDER`) as ProviderId) || 'aicredits'
  const model = Deno.env.get(`${prefix}_MODEL`) || DEFAULT_MODEL[provider] || 'deepseek/deepseek-v4-flash'
  return { provider, model }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ProviderId = 'openai' | 'deepseek' | 'gemini' | 'openrouter' | 'litellm' | 'vllm' | 'aicredits'

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
    case 'aicredits':
      // AICredits OpenAI-compatible aggregator (https://aicredits.in). Set the
      // key as a Supabase secret; pick the model via CAMPUS_MODEL / WORLD_MODEL.
      return env('AICREDITS_API_KEY')
        ? { base: 'https://aicredits.in/v1', key: env('AICREDITS_API_KEY') }
        : { error: 'AICREDITS_API_KEY not set' }
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

// True when any turn carries an OpenAI-style image_url content part.
function hasImageParts(messages: { role: string; content: unknown }[]): boolean {
  return messages.some((m) =>
    Array.isArray(m.content) &&
    (m.content as { type?: string }[]).some((p) => p?.type === 'image_url'))
}

// PageIndex streams agentic tool-use inside delta.content (block_metadata.type
// !== 'text'). This TransformStream forwards ONLY the final answer text,
// re-emitted as standard OpenAI SSE so the browser parser handles it unchanged.
function pageIndexTextFilter(): TransformStream<Uint8Array, Uint8Array> {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let buf = ''
  return new TransformStream({
    transform(chunk, controller) {
      buf += dec.decode(chunk, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') { controller.enqueue(enc.encode('data: [DONE]\n\n')); continue }
        try {
          const j = JSON.parse(payload)
          const tok: string = j.choices?.[0]?.delta?.content ?? ''
          if (tok && j.block_metadata?.type === 'text') {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: tok } }] })}\n\n`))
          }
        } catch { /* ignore keep-alives / non-JSON */ }
      }
    },
    flush(controller) { controller.enqueue(enc.encode('data: [DONE]\n\n')) },
  })
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

  // Campus mode: PageIndex reasoning RAG when configured (grounded answers over
  // the indexed campus doc). Text-only, so skip when the turn carries images.
  const PI_KEY = Deno.env.get('PAGEINDEX_API_KEY')
  const PI_DOC = Deno.env.get('PAGEINDEX_DOC_ID')
  if (mode === 'campus' && PI_KEY && PI_DOC && !hasImageParts(messages)) {
    const docs = PI_DOC.includes(',') ? PI_DOC.split(',').map((s) => s.trim()).filter(Boolean) : PI_DOC
    const piMessages = [{ role: 'system', content: systemPrompt(mode, context) }, ...messages.map((m) => ({ role: m.role, content: m.content }))]
    let up: Response
    try {
      up = await fetch('https://api.pageindex.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', api_key: PI_KEY },
        body: JSON.stringify({ doc_id: docs, stream: true, messages: piMessages }),
      })
    } catch (e) {
      return json({ error: `pageindex fetch failed: ${e}` }, 502)
    }
    if (!up.ok || !up.body) {
      const detail = await up.text().catch(() => '')
      return json({ error: `pageindex ${up.status}`, detail: detail.slice(0, 300) }, 502)
    }
    // Filter PageIndex's agentic tool-use out; re-emit only the answer text.
    return new Response(up.body.pipeThrough(pageIndexTextFilter()), {
      headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  }

  // Backend decides which provider + model serves this mode.
  let { provider, model } = routeForMode(mode)
  // Image requests can't run on a text-only model (e.g. DeepSeek V4 Flash), so
  // route them to Gemini vision when GEMINI_API_KEY is available.
  if (hasImageParts(messages) && Deno.env.get('GEMINI_API_KEY')) {
    provider = 'gemini'
    model = Deno.env.get('VISION_MODEL') || 'gemini-2.0-flash'
  }
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
