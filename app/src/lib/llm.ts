// LLM gateway client. Calls the Supabase Edge Function `chat`, which holds all
// provider API keys server-side (keys never reach the browser) and proxies an
// OpenAI-style SSE stream back. In preview mode it calls Gemini/Gemma directly
// from the browser. Falls back to a built-in stub so the chat UX always works.
import { supabase, hasSupabase } from './supabase'
import { isDemo } from './demo'
import type { ChatMode, Message } from './types'

// Preview mode: call the Gemini/Gemma OpenAI-compatible endpoint directly from
// the browser (key in VITE_GEMINI_API_KEY). Dev-only.
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string) || 'gemini-2.0-flash'

// An uploaded file/image attached to the latest user turn.
export interface Attachment {
  kind: 'image' | 'text'
  name: string
  mime: string
  dataUrl?: string // images: data:<mime>;base64,…
  text?: string    // text-extractable files: extracted content
}

export interface LLMRequest {
  mode: ChatMode
  messages: Pick<Message, 'role' | 'content'>[]
  context?: string
  attachments?: Attachment[]
  signal?: AbortSignal
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`

// Compose the API message array, folding attachments into the last user turn
// (images as image_url parts, text files appended as context).
function buildMessages(req: LLMRequest, system: string): unknown[] {
  const msgs: { role: string; content: unknown }[] = [{ role: 'system', content: system }]
  req.messages.forEach((m) => msgs.push({ role: m.role, content: m.content }))
  const atts = req.attachments ?? []
  if (atts.length && msgs.length > 1) {
    const last = msgs[msgs.length - 1]
    const texts = atts.filter((a) => a.kind === 'text')
    const images = atts.filter((a) => a.kind === 'image' && a.dataUrl)
    let textPart = String(last.content)
    for (const f of texts) textPart += `\n\n[Attached file: ${f.name}]\n${(f.text ?? '').slice(0, 20000)}`
    last.content = images.length
      ? [{ type: 'text', text: textPart }, ...images.map((im) => ({ type: 'image_url', image_url: { url: im.dataUrl } }))]
      : textPart
  }
  return msgs
}

async function streamGeminiDirect(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  if (!GEMINI_KEY) return stub(req, onToken)
  const base =
    req.mode === 'campus'
      ? 'You are a private campus assistant. Be concise, helpful, and accurate.'
      : 'You are a helpful, concise assistant.'
  const system =
    base +
    ' Use the conversation so far to stay consistent and remember what the user told you (their name, what they study, preferences).' +
    ' When the user attaches files or images, read them and reference their content directly.' +
    ' Answer directly; do not include any <thought> reasoning in your reply.' +
    (req.context ? `\n\n${req.context}` : '')
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_KEY}` },
    body: JSON.stringify({ model: GEMINI_MODEL, stream: true, messages: buildMessages(req, system) }),
    signal: req.signal,
  })
  if (res.status === 429) return note(req, onToken, 'The model is rate-limited right now (free-tier quota). Wait a moment and try again, or use a key with billing enabled.')
  if (!res.ok || !res.body) return note(req, onToken, `The model returned an error (${res.status}). Check the API key / model in .env.local.`)
  return streamOpenAISSE(res, onToken)
}

// Gemma 4 emits <thought>…</thought> reasoning in its output. Strip it from the
// visible stream incrementally (handles tags split across chunks). No-op for
// models that don't emit thoughts.
function makeThoughtStripper(emit: (t: string) => void) {
  let pending = ''
  let inThought = false
  const OPEN = '<thought>'
  const CLOSE = '</thought>'
  const partialTail = (s: string, tag: string) => {
    const max = Math.min(s.length, tag.length - 1)
    for (let k = max; k > 0; k--) if (tag.startsWith(s.slice(s.length - k))) return k
    return 0
  }
  return {
    push(chunk: string) {
      pending += chunk
      let go = true
      while (go) {
        go = false
        if (!inThought) {
          const i = pending.indexOf(OPEN)
          if (i !== -1) { if (i > 0) emit(pending.slice(0, i)); pending = pending.slice(i + OPEN.length); inThought = true; go = true }
          else { const keep = partialTail(pending, OPEN); if (pending.length > keep) { emit(pending.slice(0, pending.length - keep)); pending = pending.slice(pending.length - keep) } }
        } else {
          const j = pending.indexOf(CLOSE)
          if (j !== -1) { pending = pending.slice(j + CLOSE.length); inThought = false; go = true }
          else { pending = pending.slice(pending.length - partialTail(pending, CLOSE)) }
        }
      }
    },
    flush() { if (!inThought && pending) emit(pending); pending = '' },
  }
}

function stripThoughtsAll(s: string): string {
  const out = s.replace(/<thought>[\s\S]*?<\/thought>/g, '').replace(/^\s+/, '').trim()
  return out || s.trim()
}

async function streamOpenAISSE(res: Response, onToken: (t: string) => void): Promise<string> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  const stripper = makeThoughtStripper(onToken)
  let buf = ''
  let raw = ''
  const finish = () => { stripper.flush(); return stripThoughtsAll(raw) }
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
      if (payload === '[DONE]') return finish()
      try {
        const json = JSON.parse(payload)
        const tok: string =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.text ??
          json.response ??
          ''
        if (tok) { raw += tok; stripper.push(tok) }
      } catch {
        raw += payload
        stripper.push(payload)
      }
    }
  }
  return finish()
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
        attachments: req.attachments ?? [],
      }),
      signal: req.signal,
    })
    if (res.status === 501) return stub(req, onToken)
    if (!res.ok || !res.body) throw new Error(`gateway ${res.status}`)
    return streamOpenAISSE(res, onToken)
  } catch (e) {
    if (req.signal?.aborted) throw e
    return stub(req, onToken)
  }
}

// Stream a short notice (rate-limit / error fallbacks) word-by-word.
async function note(req: LLMRequest, onToken: (t: string) => void, msg: string): Promise<string> {
  let full = ''
  for (const w of msg.split(/(\s+)/)) {
    if (req.signal?.aborted) break
    full += w; onToken(w)
    await new Promise((r) => setTimeout(r, 12))
  }
  return full
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
    return 'Add/drop for the spring term closes on Friday, January 31 at 11:59 PM. After that, dropping a course leaves a “W” on your transcript.'
  if (/financial aid|fafsa|scholarship/.test(l))
    return "To apply for financial aid, submit the FAFSA (or your institution's aid form) through the financial aid portal — priority deadlines are usually early spring."
  return `This is a local preview reply — set VITE_GEMINI_API_KEY in .env.local to stream real answers. You asked: “${q.trim()}”.`
}
