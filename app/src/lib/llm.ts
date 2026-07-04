// LLM gateway client. Calls the Supabase Edge Function `chat`, which holds all
// provider API keys server-side (keys never reach the browser) and proxies an
// OpenAI-style SSE stream back. In preview mode it calls Gemini/Gemma directly
// from the browser. Falls back to a built-in stub so the chat UX always works.
import { supabase, hasSupabase } from './supabase'
import { isDemo } from './demo'
import { deviceId, previewRemaining, setPreviewRemaining } from './preview'
import { stripThoughts } from './format'
import type { ChatMode, Message } from './types'

const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const PREVIEW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-chat`

// Preview mode (no login): call the capped anonymous gateway. Real answers,
// 10 free messages per device, key server-side.
async function streamPreview(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  let res: Response
  try {
    res = await fetch(PREVIEW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      // Fold attachments into the last user turn so the gateway forwards them
      // as multimodal OpenAI-format content (image_url parts + extracted text).
      body: JSON.stringify({ device_id: deviceId(), mode: req.mode, context: req.context ?? '', messages: foldAttachments(req.messages, req.attachments) }),
      signal: req.signal,
    })
  } catch {
    return note(req, onToken, 'Preview is unavailable right now. Please try again in a moment.')
  }
  if (res.status === 429) {
    setPreviewRemaining(0)
    return note(req, onToken, "You've used all 10 free preview messages for today — they reset tomorrow. Sign in with your enrollment number to keep chatting now — your campus account has no limit.")
  }
  if (!res.ok || !res.body) return note(req, onToken, 'Preview is unavailable right now. Please try again.')
  const rem = res.headers.get('x-preview-remaining')
  if (rem != null) setPreviewRemaining(Number(rem))
  return streamOpenAISSE(res, onToken)
}

// ── Custom OpenAI-compatible gateway (AICredits → DeepSeek V4 Flash) ──────
// When VITE_AI_BASE_URL + VITE_AI_API_KEY are set (local .env.local), the app
// streams directly from that gateway for every mode. The key comes from env —
// it is NEVER hardcoded. For the HOSTED site, leave these unset and route
// through the `chat` edge function instead, so the key stays server-side.
const AI_BASE = (import.meta.env.VITE_AI_BASE_URL as string | undefined)?.replace(/\/$/, '')
const AI_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined
const AI_MODELS = ((import.meta.env.VITE_AI_MODEL as string) || 'deepseek/deepseek-v4-flash')
  .split(',').map((s) => s.trim()).filter(Boolean)
const hasAiGateway = !!(AI_BASE && AI_KEY)

// ── PageIndex (reasoning RAG for Campus mode) ────────────────────────────
// When configured, Campus-mode questions are answered by PageIndex's Chat API,
// which reasons over the indexed campus document(s) and returns a grounded
// answer. Key from env, never hardcoded. VITE_PAGEINDEX_DOC_ID may be a single
// id or a comma-separated list. For the hosted site prefer the edge function.
const PAGEINDEX_KEY = import.meta.env.VITE_PAGEINDEX_API_KEY as string | undefined
const PAGEINDEX_BASE = ((import.meta.env.VITE_PAGEINDEX_BASE_URL as string) || 'https://api.pageindex.ai').replace(/\/$/, '')
const PAGEINDEX_DOC = (import.meta.env.VITE_PAGEINDEX_DOC_ID as string | undefined)?.trim()
const hasPageIndex = !!(PAGEINDEX_KEY && PAGEINDEX_DOC)

// Preview mode: call the Gemini/Gemma OpenAI-compatible endpoint directly from
// the browser (key in VITE_GEMINI_API_KEY). Dev-only.
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
// Comma-separated fallback list. On 429/500/upstream error we try the next.
const GEMINI_MODELS = ((import.meta.env.VITE_GEMINI_MODEL as string) || 'gemini-2.5-flash,gemini-2.0-flash')
  .split(',').map((s) => s.trim()).filter(Boolean)
// Image requests route here. Gemma isn't reliably multimodal, so vision uses
// Gemini flash models by default (override with VITE_GEMINI_VISION_MODEL).
const GEMINI_VISION_MODELS = ((import.meta.env.VITE_GEMINI_VISION_MODEL as string) || 'gemini-2.5-flash,gemini-2.0-flash')
  .split(',').map((s) => s.trim()).filter(Boolean)

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
function buildMessages(req: LLMRequest, system: string, vision = true): unknown[] {
  return [{ role: 'system', content: system }, ...foldAttachments(req.messages, req.attachments, vision)]
}

// Fold attachments into the LAST user message so any OpenAI-compatible
// upstream sees them. On vision models images become image_url parts; text
// files are always appended as context. On text-only models (vision=false)
// images are replaced by a short note so the request never 400s.
// The browser carries the file data — the server stays stateless.
export function foldAttachments(
  messages: Pick<Message, 'role' | 'content'>[],
  attachments: Attachment[] | undefined,
  vision = true,
): { role: string; content: unknown }[] {
  const out: { role: string; content: unknown }[] = messages.map((m) => ({ role: m.role, content: m.content }))
  const atts = attachments ?? []
  if (!atts.length || !out.length) return out
  const last = out[out.length - 1]
  const texts = atts.filter((a) => a.kind === 'text' && (a.text ?? '').length > 0)
  const images = atts.filter((a) => a.kind === 'image' && a.dataUrl)
  let textPart = String(last.content ?? '')
  for (const f of texts) textPart += `\n\n[Attached file: ${f.name}]\n${(f.text ?? '').slice(0, 20000)}`
  if (!vision) {
    if (images.length) textPart += `\n\n[${images.length} image${images.length > 1 ? 's' : ''} attached — the current model can't view images, so describe them in text if you need help.]`
    last.content = textPart
    return out
  }
  last.content = images.length
    ? [{ type: 'text', text: textPart }, ...images.map((im) => ({ type: 'image_url', image_url: { url: im.dataUrl } }))]
    : textPart
  return out
}

// Stream from the custom OpenAI-compatible gateway (AICredits / DeepSeek).
// DeepSeek V4 Flash is a reasoning model: its <thought> / reasoning_content is
// kept out of the visible stream by streamOpenAISSE (which only reads
// delta.content). Models are tried in order; 429/5xx falls through to the next.
async function streamAiGateway(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
  const base =
    req.mode === 'campus'
      ? 'You are a private campus assistant. Be concise, helpful, and accurate.'
      : 'You are a helpful, concise assistant.'
  const system =
    base +
    ' Use the conversation so far to stay consistent and remember what the user told you (their name, what they study, preferences).' +
    ' When the user attaches text files, read them and reference their content directly.' +
    (req.context ? `\n\n${req.context}` : '')
  let lastStatus = 0
  for (const model of AI_MODELS) {
    if (req.signal?.aborted) throw new Error('aborted')
    let res: Response
    try {
      res = await fetch(`${AI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
        // vision=false: DeepSeek is text-only, so images fold to a text note.
        body: JSON.stringify({ model, stream: true, messages: buildMessages(req, system, false) }),
        signal: req.signal,
      })
    } catch { lastStatus = 0; continue }
    if (res.ok && res.body) return streamOpenAISSE(res, onToken)
    lastStatus = res.status
    if (res.status === 429 || res.status >= 500) continue // fall through to next model
    return note(req, onToken, `The model returned an error (${res.status}). Check the AICredits key / model.`)
  }
  return note(req, onToken,
    lastStatus === 429
      ? 'The model is rate-limited right now. Wait a moment and try again.'
      : `The model is unavailable (${lastStatus}). Try again in a moment.`)
}

// Campus mode via PageIndex Chat API — reasoning retrieval over the indexed
// campus doc(s). Falls back to the normal engine on any error so chat never
// dead-ends.
async function streamPageIndex(
  req: LLMRequest,
  onToken: (t: string) => void,
  fallback: (r: LLMRequest, o: (t: string) => void) => Promise<string>,
): Promise<string> {
  const docs = PAGEINDEX_DOC!.includes(',') ? PAGEINDEX_DOC!.split(',').map((s) => s.trim()).filter(Boolean) : PAGEINDEX_DOC!
  // PageIndex answers from the doc; pass conversation text + any memory context.
  const history = foldAttachments(req.messages, req.attachments, false)
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content) }))
  const messages = req.context ? [{ role: 'system', content: req.context }, ...history] : history
  let res: Response
  try {
    res = await fetch(`${PAGEINDEX_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_key: PAGEINDEX_KEY! },
      body: JSON.stringify({ doc_id: docs, stream: true, messages }),
      signal: req.signal,
    })
  } catch {
    return fallback(req, onToken) // network error → answer without grounding
  }
  if (!res.ok || !res.body) return fallback(req, onToken)
  return streamPageIndexSSE(res, onToken)
}

// PageIndex streams its agentic tool-use (page reads) inside delta.content too,
// tagged block_metadata.type !== 'text'. Surface ONLY the final answer text.
async function streamPageIndexSSE(res: Response, onToken: (t: string) => void): Promise<string> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let out = ''
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
      if (payload === '[DONE]') return out
      try {
        const json = JSON.parse(payload)
        const tok: string = json.choices?.[0]?.delta?.content ?? ''
        if (tok && json.block_metadata?.type === 'text') { out += tok; onToken(tok) }
      } catch { /* ignore keep-alives / non-JSON */ }
    }
  }
  return out
}

async function streamGeminiDirect(req: LLMRequest, onToken: (t: string) => void, models: string[] = GEMINI_MODELS): Promise<string> {
  if (!GEMINI_KEY) return stub(req, onToken)
  const base =
    req.mode === 'campus'
      ? 'You are a private campus assistant. Be concise, helpful, and accurate.'
      : 'You are a helpful, concise assistant.'
  const system =
    base +
    ' Use the conversation so far to stay consistent and remember what the user told you (their name, what they study, preferences).' +
    ' When the user attaches files or images, read them and reference their content directly.' +
    (req.context ? `\n\n${req.context}` : '')
  // Try each model in order; fall through on 429 (quota) or 5xx (transient).
  let lastStatus = 0
  for (const model of models) {
    if (req.signal?.aborted) throw new Error('aborted')
    let res: Response
    try {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_KEY}` },
        body: JSON.stringify({ model, stream: true, messages: buildMessages(req, system) }),
        signal: req.signal,
      })
    } catch { lastStatus = 0; continue }
    if (res.ok && res.body) return streamOpenAISSE(res, onToken)
    lastStatus = res.status
    if (res.status === 429 || res.status >= 500) continue // fall through to next model
    return note(req, onToken, `The model returned an error (${res.status}). Check the API key / model in .env.local.`)
  }
  return note(req, onToken,
    lastStatus === 429
      ? 'All configured models are rate-limited (free-tier quota). Wait a moment and try again, or use a key with billing enabled.'
      : `All configured models failed (${lastStatus}). Try again in a moment.`)
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

async function streamOpenAISSE(res: Response, onToken: (t: string) => void): Promise<string> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  const stripper = makeThoughtStripper(onToken)
  let buf = ''
  let raw = ''
  const finish = () => { stripper.flush(); return stripThoughts(raw) }
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
  const hasImages = (req.attachments ?? []).some((a) => a.kind === 'image' && a.dataUrl)

  // Engine selection (local dev with browser keys in .env.local):
  //   • images        → Gemini vision (DeepSeek V4 Flash is text-only)
  //   • Campus + docs  → PageIndex reasoning RAG (grounded campus answers)
  //   • text          → AICredits / DeepSeek V4 Flash
  //   • else          → Gemini as a legacy fallback
  const textEngine: ((r: LLMRequest, o: (t: string) => void) => Promise<string>) | null =
    hasAiGateway ? streamAiGateway : GEMINI_KEY ? streamGeminiDirect : null
  let engine: ((r: LLMRequest, o: (t: string) => void) => Promise<string>) | null = null
  if (hasImages && GEMINI_KEY) engine = (r, o) => streamGeminiDirect(r, o, GEMINI_VISION_MODELS)
  else if (req.mode === 'campus' && hasPageIndex) engine = (r, o) => streamPageIndex(r, o, textEngine ?? stub)
  else engine = textEngine

  if (engine) {
    // Anonymous preview keeps its per-device daily cap; signed-in users uncapped.
    if (isDemo()) {
      if (previewRemaining() <= 0) {
        return note(req, onToken, "You've used all 10 free preview messages for today — they reset tomorrow. Sign in with your enrollment number to keep chatting now.")
      }
      const full = await engine(req, onToken)
      setPreviewRemaining(previewRemaining() - 1)
      return full
    }
    return engine(req, onToken)
  }
  // Preview (no login), no local key: capped anonymous gateway with real answers.
  if (isDemo()) return streamPreview(req, onToken)
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
        // Fold attachments client-side so the gateway is provider-agnostic.
        messages: foldAttachments(req.messages, req.attachments),
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
