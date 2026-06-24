// LLM gateway client. Calls the Supabase Edge Function `chat`, which holds all
// provider API keys server-side (keys never reach the browser) and proxies an
// OpenAI-style SSE stream back. If the gateway is unreachable or no key is
// configured for the chosen provider, falls back to a built-in stub so the chat
// UX always works.
import { supabase, hasSupabase } from './supabase'
import { isDemo } from './demo'
import type { ChatMode, Message } from './types'

// Preview mode: call Gemini's OpenAI-compatible endpoint directly from the
// browser (key in VITE_GEMINI_API_KEY). Dev-only — in production the edge
// function holds keys server-side. Falls back to the stub if no key is set.
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string) || 'gemini-2.0-flash'

async function streamGeminiDirect(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  if (!GEMINI_KEY) return stub(req, onToken)
  const sys =
    req.mode === 'campus'
      ? "You are a private campus assistant. Be concise, helpful, and accurate."
      : 'You are Merzal AI, a helpful, concise assistant.'
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_KEY}` },
    body: JSON.stringify({ model: GEMINI_MODEL, stream: true, messages: [{ role: 'system', content: sys }, ...req.messages] }),
    signal: req.signal,
  })
  if (!res.ok || !res.body) return stub(req, onToken)
  return streamOpenAISSE(res, onToken)
}

// The client never chooses a model. It sends the mode (campus|world) and the
// edge function maps that to a provider + model from server-side config, so
// users only ever see the Campus/World toggle.
export interface LLMRequest {
  mode: ChatMode
  messages: Pick<Message, 'role' | 'content'>[]
  context?: string
  signal?: AbortSignal
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`

async function streamOpenAISSE(res: Response, onToken: (t: string) => void): Promise<string> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return full
      try {
        const json = JSON.parse(payload)
        const tok: string =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.text ??
          json.response ??
          ''
        if (tok) { full += tok; onToken(tok) }
      } catch {
        full += payload
        onToken(payload)
      }
    }
  }
  return full
}

export async function streamChat(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  if (isDemo()) return streamGeminiDirect(req, onToken)
  if (!hasSupabase) return stub(req, onToken)
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        mode: req.mode,
        context: req.context ?? '',
        messages: req.messages,
      }),
      signal: req.signal,
    })
    // 501 = provider not configured (no secret). Fall back to the stub.
    if (res.status === 501) return stub(req, onToken)
    if (!res.ok || !res.body) throw new Error(`gateway ${res.status}`)
    return streamOpenAISSE(res, onToken)
  } catch (e) {
    if (req.signal?.aborted) throw e
    return stub(req, onToken)
  }
}

// ── Built-in stub (no backend needed) ────────────────────────────────
async function stub(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  const last = req.messages[req.messages.length - 1]?.content ?? ''
  const reply = canned(last, req.mode)
  let full = ''
  for (const w of reply.split(/(\s+)/)) {
    if (req.signal?.aborted) break
    full += w
    onToken(w)
    await new Promise((r) => setTimeout(r, 16 + Math.min(60, w.length * 6)))
  }
  return full
}

function canned(q: string, mode: ChatMode): string {
  const l = q.toLowerCase()
  if (mode === 'campus' && /add\/?drop|deadline/.test(l))
    return 'Add/drop for the spring term closes on Friday, January 31 at 11:59 PM. After that, dropping a course leaves a “W” on your transcript. Want me to pull up the official academic calendar?'
  if (/financial aid|fafsa|scholarship/.test(l))
    return "To apply for financial aid, submit the FAFSA (or your institution's aid form) through the financial aid portal — priority deadlines are usually early spring."
  if (/photosynthesis/.test(l))
    return 'Photosynthesis turns sunlight, water, and CO₂ into glucose and oxygen: 6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂. Want the light reactions vs. the Calvin cycle?'
  return `This is a local preview reply — add an API key as a Supabase secret (e.g. OPENAI_API_KEY) and pick a provider to stream real answers. You asked: “${q.trim()}”.`
}
