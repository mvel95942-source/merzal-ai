// Pluggable retrieval layer. The chat composes: user query + retrieved
// knowledge + model response. Today Campus mode injects the admin-maintained
// career-guidance markdown directly into the system prompt. A future
// GraphRAGProvider / PageIndexProvider drops in here with zero chat-UI changes.
import { api } from './api'
import type { ChatMode } from './types'

const CACHE_TTL_MS = 30_000
let cached: { at: number; text: string } | null = null
const CAMPUS_KNOWLEDGE_BUDGET = 6_000 // chars; keeps prompt small

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

// Campus knowledge today: serve the admin's career-guidance markdown verbatim
// (capped to CAMPUS_KNOWLEDGE_BUDGET chars). When PageIndex / GraphRAG lands,
// replace the body of `retrieve` with a query-conditioned call — the chat
// pipeline doesn't change. Cached briefly so chat sends don't re-fetch.
export const CampusKnowledgeProvider: KnowledgeProvider = {
  id: 'campus',
  async retrieve(/* query */) {
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
