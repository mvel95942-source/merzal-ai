// Merzal AI — LLM gateway edge function.
//
// Routing:
//   • Campus mode → hierarchical TREE SEARCH over the PageIndex index: our LLM
//     reasons over the doc's section tree, picks the relevant nodes, and DeepSeek
//     answers from just those sections (no whole-document read). Falls back to
//     full-OCR grounding if the tree is unavailable.
//   • World mode / text → DeepSeek V4 Flash (AICredits)
//   • Images → Gemma 4 26B-A4B on AICredits (cheap MoE, ~4B active), Gemini fallback
//   • Fallback chain on 429/5xx/network: DeepSeek → Gemma 4 → Gemini flash
//
// PageIndex is the document INDEX/RETRIEVAL layer only — never its chat/answer
// model; our own LLM reasons + answers. Campus doc ids come from
// public.pageindex_docs (admin-managed), falling back to the PAGEINDEX_DOC_ID
// secret. All API keys come from Supabase secrets.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const FALLBACK: Record<string, string> = {
  AICREDITS_BASE_URL: 'https://aicredits.in/v1',
  AICREDITS_MODEL: 'deepseek/deepseek-v4-flash',
  GEMINI_MODELS: 'gemma-4-31b-it,gemini-2.5-flash,gemini-2.0-flash',
  GEMINI_VISION_MODELS: 'gemini-2.5-flash,gemini-2.0-flash',
  VISION_MODEL: 'google/gemma-4-26b-a4b-it',
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

function systemPrompt(mode: string, context: string, updates: string): string {
  const base = mode === 'campus'
    ? "You are a private campus assistant. Be concise, helpful, and accurate. Ground answers in the provided campus context when present; if the context doesn't cover it, say you don't have that information."
    : 'You are Merzal AI, a helpful, concise assistant.'
  // Temporary knowledge: short-lived, admin-authored campus facts (never
  // indexed). Placed before document context so time-sensitive updates win.
  const withUpdates = updates ? `${base}\n\nCampus updates (current, time-sensitive — mention when relevant):\n${updates}` : base
  return context ? `${withUpdates}\n\nContext:\n${context}` : withUpdates
}

// Bounded prompt block from the caller's ACTIVE temporary knowledge. The RPC
// is SECURITY DEFINER keyed to auth.uid(): scope (dept/semester/section/
// visibility/time window) is resolved server-side from the stored profile —
// nothing the client sends can widen it.
const TEMP_KNOWLEDGE_CHAR_BUDGET = 2_000
async function tempKnowledgeBlock(supabase: SupabaseClient): Promise<string> {
  try {
    const { data } = await supabase.rpc('active_temp_knowledge')
    const items = (data ?? []) as { title: string; content: string }[]
    let out = ''
    for (const it of items) {
      const line = `- ${it.title}: ${it.content}\n`
      if (out.length + line.length > TEMP_KNOWLEDGE_CHAR_BUDGET) break
      out += line
    }
    return out.trimEnd()
  } catch { return '' }
}

// ── Grounding cache ───────────────────────────────────────────────────────
// The campus doc set and its OCR are effectively static, but this function
// previously hit the pageindex_docs TABLE and re-fetched the FULL doc OCR from
// PageIndex on EVERY message — two blocking round-trips (plus a large JSON
// parse) before DeepSeek could emit its first token. That was the "system is
// slow" bug: the stall was ours, not the model's. Cache both in module scope
// (kept across warm invocations) so grounding is fetched once, then reused.
const GROUND_TTL_MS = 10 * 60_000 // 10 min — occasional refresh if docs change
let piCache: { at: number; ids: string; text: string } | null = null
let treeCache: { at: number; ids: string; nodes: FlatNode[] } | null = null

// A section of the PageIndex hierarchical tree, flattened for LLM reasoning.
type FlatNode = { id: string; title: string; summary: string; text: string }
type TreeNode = { node_id?: string; title?: string; summary?: string; text?: string; nodes?: TreeNode[] }

// Campus doc ids for THIS caller. Queried through the user's own RLS-scoped
// client, so students only ever see documents whose metadata (department /
// semester / section / visibility / date window) targets them — RBAC happens
// here, BEFORE any retrieval. Deliberately NOT cached in module scope: a
// global cache would leak one user's document scope to the next request.
async function campusDocIds(supabase: SupabaseClient): Promise<string[]> {
  let ids: string[] = []
  try {
    const { data } = await supabase.from('pageindex_docs').select('doc_id')
    ids = (data ?? []).map((r: { doc_id: string }) => r.doc_id).filter(Boolean)
  } catch { /* fall through to env */ }
  if (!ids.length) {
    const envDoc = Deno.env.get('PAGEINDEX_DOC_ID') || ''
    ids = envDoc ? envDoc.split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  return ids
}

// PageIndex is RETRIEVAL / the document index only — pull each campus doc's full
// OCR markdown and hand the WHOLE thing to OUR LLM (DeepSeek). Used as the
// FALLBACK when hierarchical tree search is unavailable. Cached (10-min TTL).
async function pageIndexContext(docs: string[]): Promise<string> {
  const key = Deno.env.get('PAGEINDEX_API_KEY')
  if (!key || !docs.length) return ''
  const ids = docs.join(',')
  if (piCache && piCache.ids === ids && Date.now() - piCache.at < GROUND_TTL_MS) return piCache.text
  const parts: string[] = []
  for (const doc of docs) {
    try {
      const res = await fetch(`https://api.pageindex.ai/doc/${doc}/?type=ocr`, { headers: { api_key: key } })
      if (!res.ok) continue
      const data = await res.json()
      const r = data.result
      const pages = r && typeof r === 'object' ? Object.values(r).flat() : []
      for (const pg of pages as Array<{ markdown?: string }>) {
        const md = pg?.markdown
        if (md) parts.push(md)
      }
    } catch { /* answer ungrounded on failure */ }
  }
  const text = parts.join('\n\n')
  piCache = { at: Date.now(), ids, text }
  return text
}

// Fetch the PageIndex hierarchical TREE (node_id + title + summary + text) and
// flatten it. This is the index PageIndex builds — we reason over it instead of
// reading the whole document. Cached so the fetch runs once per TTL.
async function campusTree(docs: string[]): Promise<FlatNode[]> {
  const key = Deno.env.get('PAGEINDEX_API_KEY')
  if (!key || !docs.length) return []
  const ids = docs.join(',')
  if (treeCache && treeCache.ids === ids && Date.now() - treeCache.at < GROUND_TTL_MS) return treeCache.nodes
  const flat: FlatNode[] = []
  const walk = (n: TreeNode) => {
    if (n.node_id) flat.push({ id: n.node_id, title: n.title ?? '', summary: n.summary ?? '', text: n.text ?? '' })
    for (const c of n.nodes ?? []) walk(c)
  }
  for (const doc of docs) {
    try {
      const res = await fetch(`https://api.pageindex.ai/doc/${doc}/?type=tree&summary=true`, { headers: { api_key: key } })
      if (!res.ok) continue
      const data = await res.json()
      const roots = Array.isArray(data.result) ? data.result : [data.result]
      for (const root of roots) if (root) walk(root as TreeNode)
    } catch { /* tree unavailable — caller falls back to full OCR */ }
  }
  treeCache = { at: Date.now(), ids, nodes: flat }
  return flat
}

// Hierarchical reasoning: give OUR LLM the tree's titles + summaries and let it
// pick the node_ids relevant to this query — unlimited (as many as it wants), no
// whole-document read. One small, fast call; returns [] on any failure so the
// caller can fall back to full-OCR grounding.
async function selectNodes(query: string, nodes: FlatNode[]): Promise<string[]> {
  const key = Deno.env.get('AICREDITS_API_KEY')
  if (!key || !nodes.length || !query.trim()) return []
  const toc = nodes.map((n) => `- ${n.id}: ${n.title}${n.summary ? ` — ${n.summary}` : ''}`).join('\n')
  const prompt =
    'You are given a user query and the section tree (node_id: title — summary) of a campus document. ' +
    'Return the node_ids of ALL sections that could contain the answer — include generously if unsure. ' +
    'Respond with ONLY JSON: {"node_list":["<id>", ...]}.\n\n' +
    `Query: ${query}\n\nTree:\n${toc}`
  try {
    const res = await fetch(`${env('AICREDITS_BASE_URL')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: env('AICREDITS_MODEL'), stream: false, temperature: 0, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const m = content.match(/\{[\s\S]*\}/)
    const list = m ? JSON.parse(m[0])?.node_list : null
    return Array.isArray(list) ? list.map(String) : []
  } catch { return [] }
}

// Campus grounding via hierarchical tree search: tree → LLM picks nodes → pull
// just those nodes' text. Falls back to full-OCR grounding whenever the tree or
// its node text isn't usable, so campus mode is never left ungrounded.
async function campusGrounding(docs: string[], query: string): Promise<string> {
  const nodes = await campusTree(docs)
  if (nodes.length) {
    const picked = await selectNodes(query, nodes)
    const chosen = picked.length ? nodes.filter((n) => picked.includes(n.id)) : nodes
    const grounding = chosen.map((n) => (n.text ? `## ${n.title}\n${n.text}` : '')).filter(Boolean).join('\n\n')
    if (grounding.trim()) return grounding
  }
  return pageIndexContext(docs) // tree/text unavailable → full-document fallback
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

  // RBAC gate before ANY retrieval: a disabled profile gets nothing, and all
  // knowledge scoping below derives from the stored profile via RLS / the
  // active_temp_knowledge RPC — never from the request body.
  const { data: prof } = await supabase.from('user_profiles').select('disabled').eq('id', userData.user.id).maybeSingle()
  if (prof?.disabled) return json({ error: 'account_disabled' }, 403)

  let body: { mode?: string; context?: string; messages: Msg[] }
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const { mode = 'campus', context = '', messages } = body
  if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'messages required' }, 400)

  const images = hasImageParts(messages)

  // 1) Temporary knowledge — lightweight prompt layer, loaded for every
  //    response, before (and independent of) PageIndex retrieval.
  const updates = await tempKnowledgeBlock(supabase)

  // 2) Campus grounding: hierarchical tree search over the PageIndex index (our
  //    LLM picks the relevant sections) — restricted to the docs this caller may
  //    see (campusDocIds is RLS-scoped).
  let ctx = context
  if (mode === 'campus' && !images) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const query = typeof lastUser?.content === 'string' ? lastUser.content : ''
    const grounding = await campusGrounding(await campusDocIds(supabase), query)
    if (grounding) ctx = ctx ? `${ctx}\n\n${grounding}` : grounding
  }

  const chat: Msg[] = [{ role: 'system', content: systemPrompt(mode, ctx, updates) }, ...messages]

  // Provider fallback chain.
  const attempts: { base: string; key: string; model: string }[] = []
  if (images) {
    // Images need a real MULTIMODAL model. DeepSeek V4 (flash AND pro) are
    // text-only: the gateway rejects image input with 404 (no endpoints found
    // that support image input), verified against the live API — so images must
    // never route there. Gemma 4 26B-A4B is a MoE with only ~4B active params,
    // so it reads images at a fraction of DeepSeek Flash's cost, on the SAME
    // AICredits key. Gemini vision stays as the fallback.
    if (Deno.env.get('AICREDITS_API_KEY')) attempts.push({ base: env('AICREDITS_BASE_URL'), key: Deno.env.get('AICREDITS_API_KEY')!, model: env('VISION_MODEL') })
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
