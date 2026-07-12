// Merzal AI — LLM gateway edge function.
//
// Routing:
//   • Campus mode → PageIndex RETRIEVES admin-uploaded docs, DeepSeek ANSWERS
//   • World mode / text → DeepSeek V4 Flash (AICredits)
//   • Images → Gemini vision
//   • Fallback chain on 429/5xx/network: DeepSeek → Gemma 4 → Gemini flash
//
// PageIndex is RETRIEVAL ONLY; our own LLM reasons + answers. Campus doc ids
// come from public.pageindex_docs (admin-managed), falling back to the
// PAGEINDEX_DOC_ID secret. All API keys come from Supabase secrets.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const FALLBACK: Record<string, string> = {
  AICREDITS_BASE_URL: 'https://aicredits.in/v1',
  AICREDITS_MODEL: 'deepseek/deepseek-v4-flash',
  GEMINI_MODELS: 'gemma-4-31b-it,gemini-2.5-flash,gemini-2.0-flash',
  GEMINI_VISION_MODELS: 'gemini-2.5-flash,gemini-2.0-flash',
}
const env = (k: string) => Deno.env.get(k) || FALLBACK[k] || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'

type Msg = { role: string; content: unknown }

function hasImageParts(messages: Msg[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && (m.content as { type?: string }[]).some((p) => p?.type === 'image_url'))
}

function systemPrompt(mode: string, context: string): string {
  const base = mode === 'campus'
    ? "You are a private campus assistant. Be concise, helpful, and accurate. Ground answers in the provided campus context when present; if the context doesn't cover it, say you don't have that information."
    : 'You are Merzal AI, a helpful, concise assistant.'
  return context ? `${base}\n\nContext:\n${context}` : base
}

// ── Grounding cache ───────────────────────────────────────────────────────
// The campus doc set and its OCR are effectively static, but this function
// previously hit the pageindex_docs TABLE and re-fetched the FULL doc OCR from
// PageIndex on EVERY message — two blocking round-trips (plus a large JSON
// parse) before DeepSeek could emit its first token. That was the "system is
// slow" bug: the stall was ours, not the model's. Cache both in module scope
// (kept across warm invocations) so grounding is fetched once, then reused.
const GROUND_TTL_MS = 10 * 60_000 // 10 min — occasional refresh if docs change
let docIdsCache: { at: number; ids: string[] } | null = null
let piCache: { at: number; ids: string; text: string } | null = null

// Campus doc ids: admin-managed table first, else the PAGEINDEX_DOC_ID secret.
async function campusDocIds(supabase: SupabaseClient): Promise<string[]> {
  if (docIdsCache && Date.now() - docIdsCache.at < GROUND_TTL_MS) return docIdsCache.ids
  let ids: string[] = []
  try {
    const { data } = await supabase.from('pageindex_docs').select('doc_id')
    ids = (data ?? []).map((r: { doc_id: string }) => r.doc_id).filter(Boolean)
  } catch { /* fall through to env */ }
  if (!ids.length) {
    const envDoc = Deno.env.get('PAGEINDEX_DOC_ID') || ''
    ids = envDoc ? envDoc.split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  docIdsCache = { at: Date.now(), ids }
  return ids
}

// PageIndex RETRIEVAL only: pull each doc's full OCR markdown as grounding text.
// (The tree/summary view collapses small docs to just the title — OCR gives the
// actual body content that DeepSeek then reasons over.) Result is cached so the
// slow per-message fetch runs once, not on every turn.
async function pageIndexContext(docs: string[]): Promise<string> {
  const key = Deno.env.get('PAGEINDEX_API_KEY')
  if (!key || !docs.length) return ''
  const ids = docs.join(',')
  if (piCache && piCache.ids === ids && Date.now() - piCache.at < GROUND_TTL_MS) return piCache.text
  const parts: string[] = []
  let total = 0
  const CAP = 40000
  for (const doc of docs) {
    if (total >= CAP) break
    try {
      const res = await fetch(`https://api.pageindex.ai/doc/${doc}/?type=ocr`, { headers: { api_key: key } })
      if (!res.ok) continue
      const data = await res.json()
      const r = data.result
      const pages = r && typeof r === 'object' ? Object.values(r).flat() : []
      for (const pg of pages as Array<{ markdown?: string }>) {
        const md = pg?.markdown
        if (!md) continue
        parts.push(md)
        total += md.length
        if (total >= CAP) break
      }
    } catch { /* answer ungrounded on failure */ }
  }
  const text = parts.join('\n\n').slice(0, CAP)
  piCache = { at: Date.now(), ids, text }
  return text
}

// One upstream attempt. Streaming Response on success, else null.
async function tryUpstream(base: string, key: string, model: string, messages: Msg[]): Promise<Response | null> {
  try {
    const up = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: true, messages }),
    })
    return up.ok && up.body ? up : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  let body: { mode?: string; context?: string; messages: Msg[] }
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const { mode = 'campus', context = '', messages } = body
  if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'messages required' }, 400)

  const images = hasImageParts(messages)

  // Campus grounding: PageIndex retrieves (admin docs), DeepSeek answers.
  let ctx = context
  if (mode === 'campus' && !images) {
    const pi = await pageIndexContext(await campusDocIds(supabase))
    if (pi) ctx = ctx ? `${ctx}\n\n${pi}` : pi
  }

  const chat: Msg[] = [{ role: 'system', content: systemPrompt(mode, ctx) }, ...messages]

  // Provider fallback chain.
  const attempts: { base: string; key: string; model: string }[] = []
  if (images) {
    for (const m of env('GEMINI_VISION_MODELS').split(',').map((s) => s.trim()).filter(Boolean)) attempts.push({ base: GEMINI_BASE, key: Deno.env.get('GEMINI_API_KEY') || '', model: m })
  } else {
    if (Deno.env.get('AICREDITS_API_KEY')) attempts.push({ base: env('AICREDITS_BASE_URL'), key: Deno.env.get('AICREDITS_API_KEY')!, model: env('AICREDITS_MODEL') })
    for (const m of env('GEMINI_MODELS').split(',').map((s) => s.trim()).filter(Boolean)) attempts.push({ base: GEMINI_BASE, key: Deno.env.get('GEMINI_API_KEY') || '', model: m })
  }

  for (const a of attempts) {
    if (!a.key) continue
    const up = await tryUpstream(a.base, a.key, a.model, chat)
    if (up) return new Response(up.body, { headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } })
  }
  return json({ error: 'all providers failed' }, 502)
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
