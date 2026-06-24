// Pluggable retrieval layer. The chat composes: user query + retrieved
// knowledge + model response. Today only WorldKnowledge (Gemini, no retrieval).
// A future GraphRAGProvider drops in here with zero chat-UI changes.
import type { ChatMode } from './types'

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

// Campus mode placeholder — wire GraphRAG here later (college info, events,
// academic resources, internal docs). Returns '' until connected.
export const GraphRAGProvider: KnowledgeProvider = {
  id: 'graphrag',
  async retrieve(/* query */) {
    // TODO: call the GraphRAG service and return ranked chunks as context.
    return ''
  },
}

export function knowledgeFor(mode: ChatMode): KnowledgeProvider {
  return mode === 'campus' ? GraphRAGProvider : WorldKnowledgeProvider
}
