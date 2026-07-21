// Pluggable retrieval layer. The chat composes: user query + retrieved
// knowledge + model response. Campus mode grounds answers in PageIndex — the
// campus document(s) are indexed there, and we pull their content as context.
// DeepSeek (see lib/llm.ts) writes the answer; PageIndex only retrieves.
// Falls back to the admin-maintained career-guidance markdown when PageIndex
// isn't configured. Drops in here with zero chat-UI changes.
import { api } from './api'
import { webSearch } from './websearch'
import type { ChatMode } from './types'

const CACHE_TTL_MS = 30_000
let cached: { at: number; text: string } | null = null
const CAMPUS_KNOWLEDGE_BUDGET = 6_000 // chars; career-guide fallback stays small

// ── PageIndex retrieval (Campus grounding) ───────────────────────────────
// Key + doc id(s) from env — never hardcoded. For the hosted site prefer the
// edge function (PAGEINDEX_* secrets); locally these VITE_ vars power it.
// SECURITY: the PageIndex key is a live secret. Reference it ONLY in a
// statically-`false` dev branch so it is dead-code-eliminated from production
// bundles. In prod, campus grounding runs server-side in the `chat` edge
// function (PAGEINDEX_* Supabase secrets); the browser never holds this key.
const PI_KEY = import.meta.env.DEV ? (import.meta.env.VITE_PAGEINDEX_API_KEY as string | undefined) : undefined
const PI_BASE = ((import.meta.env.VITE_PAGEINDEX_BASE_URL as string) || 'https://api.pageindex.ai').replace(/\/$/, '')
const PI_DOCS = ((import.meta.env.VITE_PAGEINDEX_DOC_ID as string) || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const hasPageIndex = !!(PI_KEY && PI_DOCS.length)
const PI_BUDGET = 60_000 // chars of doc content; DeepSeek V4 Flash has 1M ctx
let piCache: { at: number; text: string } | null = null

// Fetch the full indexed text of every configured doc as one grounding string.
// type=ocr returns the document's markdown per page (result[].markdown).
async function pageIndexContent(): Promise<string> {
  if (piCache && Date.now() - piCache.at < CACHE_TTL_MS) return piCache.text
  const parts: string[] = []
  for (const doc of PI_DOCS) {
    const res = await fetch(`${PI_BASE}/doc/${doc}/?type=ocr`, { headers: { api_key: PI_KEY! } })
    if (!res.ok) continue
    const json = await res.json()
    const pages = json.result ?? []
    const md = (Array.isArray(pages) ? pages : [pages])
      .map((p: { markdown?: string; text?: string }) => (p.markdown ?? p.text ?? '').trim())
      .filter(Boolean).join('\n\n')
    if (md) parts.push(md)
  }
  const text = parts.join('\n\n---\n\n').slice(0, PI_BUDGET).trim()
  piCache = { at: Date.now(), text }
  return text
}

export interface KnowledgeProvider {
  id: string
  /** Return context to ground the answer, or '' for none. */
  retrieve(query: string, mode: ChatMode): Promise<string>
}

// Pure chit-chat / greetings don't need a web search — skip those to avoid a
// pointless round-trip. Everything else in World mode gets live web grounding.
const CHITCHAT = /^(hi+|hey+|hello+|yo+|hola|vanakkam|thanks?|thank you|thx|ok(ay)?|cool|nice|good (morning|afternoon|evening|night)|how are you|sup|wassup|bye|see ya)\b[\s!.?]*$/i

// World/General mode: ground answers in a live DuckDuckGo web search so the
// model can answer current/factual questions and cite real sources. Runs
// through the `web-search` edge function (server-side, no CORS). On any failure
// or empty result it returns '' and the model answers from its own knowledge.
export const WorldKnowledgeProvider: KnowledgeProvider = {
  id: 'world',
  async retrieve(query) {
    const q = (query || '').trim()
    if (q.length < 4 || CHITCHAT.test(q)) return ''
    const results = await webSearch(q, 5)
    if (!results.length) return ''
    const block = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}${r.snippet ? `\n${r.snippet}` : ''}`)
      .join('\n\n')
    return [
      'Live web search results (DuckDuckGo) for the user\'s question. Use them to answer with current, accurate information.',
      'Cite the sources you rely on inline as [1], [2], … and, when the answer draws on them, end with a short "Sources:" list of the URLs used.',
      'If these results are irrelevant or unhelpful, ignore them and answer from your own knowledge — never mention that a search returned nothing.',
      '',
      block,
    ].join('\n')
  },
}

// Campus grounding: combine BOTH sources so answers are grounded in everything
// the admin has provided —
//   1. the manually-edited career-guidance knowledge (campus_knowledge table),
//   2. the indexed campus document(s) from PageIndex (when configured).
// Neither replaces the other. DeepSeek writes the answer from the combined
// context. Each source is cached briefly so chat sends don't re-fetch.
async function careerGuideContent(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text
  try {
    const g = await api.getCareerGuide()
    const text = (g?.content ?? '').slice(0, CAMPUS_KNOWLEDGE_BUDGET).trim()
    cached = { at: Date.now(), text }
    return text
  } catch { return cached?.text ?? '' }
}

export const CampusKnowledgeProvider: KnowledgeProvider = {
  id: 'campus',
  async retrieve(/* query */) {
    const sources: { label: string; body: string }[] = []

    const guide = await careerGuideContent()
    if (guide) sources.push({ label: 'Campus notes (kept up to date by your admin)', body: guide })

    if (hasPageIndex) {
      try {
        const docs = await pageIndexContent()
        if (docs) sources.push({ label: 'Campus documents', body: docs })
      } catch { /* keep whatever else we have */ }
    }

    if (!sources.length) return ''
    const blocks = sources.map((s) => `### ${s.label}\n${s.body}`).join('\n\n')
    return `Campus knowledge — answer Campus-mode questions from the material below; if it isn't covered here, say you don't have that information:\n\n${blocks}`
  },
}

export function knowledgeFor(mode: ChatMode): KnowledgeProvider {
  return mode === 'campus' ? CampusKnowledgeProvider : WorldKnowledgeProvider
}
