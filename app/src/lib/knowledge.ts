// Pluggable retrieval layer. The chat composes: user query + retrieved
// knowledge + model response. Campus mode grounds answers in PageIndex — the
// campus document(s) are indexed there, and we pull their content as context.
// DeepSeek (see lib/llm.ts) writes the answer; PageIndex only retrieves.
// Falls back to the admin-maintained career-guidance markdown when PageIndex
// isn't configured. Drops in here with zero chat-UI changes.
import { api } from './api'
import type { ChatMode } from './types'

const CACHE_TTL_MS = 30_000
let cached: { at: number; text: string } | null = null
const CAMPUS_KNOWLEDGE_BUDGET = 6_000 // chars; career-guide fallback stays small

// ── PageIndex retrieval (Campus grounding) ───────────────────────────────
// Key + doc id(s) from env — never hardcoded. For the hosted site prefer the
// edge function (PAGEINDEX_* secrets); locally these VITE_ vars power it.
const PI_KEY = import.meta.env.VITE_PAGEINDEX_API_KEY as string | undefined
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

// World mode: rely on the model's own knowledge, no external retrieval.
export const WorldKnowledgeProvider: KnowledgeProvider = {
  id: 'world',
  async retrieve() {
    return ''
  },
}

// Campus grounding: pull the indexed campus doc content from PageIndex and
// return it as context for DeepSeek to answer from. Falls back to the admin's
// career-guidance markdown when PageIndex isn't configured or errors. Cached
// briefly so chat sends don't re-fetch.
export const CampusKnowledgeProvider: KnowledgeProvider = {
  id: 'campus',
  async retrieve(/* query */) {
    if (hasPageIndex) {
      try {
        const body = await pageIndexContent()
        if (body) return `Campus knowledge — answer Campus-mode questions from this document; if it isn't covered here, say you don't have that information:\n${body}`
      } catch { /* fall through to the career-guide fallback */ }
    }
    try {
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text
      const g = await api.getCareerGuide()
      const body = (g?.content ?? '').slice(0, CAMPUS_KNOWLEDGE_BUDGET).trim()
      const text = body
        ? `Campus knowledge — answer Campus-mode questions from this document when relevant:\n${body}`
        : ''
      cached = { at: Date.now(), text }
      return text
    } catch { return '' }
  },
}

export function knowledgeFor(mode: ChatMode): KnowledgeProvider {
  return mode === 'campus' ? CampusKnowledgeProvider : WorldKnowledgeProvider
}
