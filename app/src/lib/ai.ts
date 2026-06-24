// Model abstraction layer. Swap the model/provider here without touching the
// chat UI. Today: Gemini (via the gateway/llm transport). Tomorrow: add another
// AIProvider and point `aiProvider` at it.
import { streamChat } from './llm'
import type { ChatMode } from './types'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AIStreamOptions {
  mode: ChatMode
  messages: ChatTurn[]
  /** Retrieved knowledge + memory, injected as system context. */
  context?: string
  signal?: AbortSignal
}

export interface AIProvider {
  id: string
  /** Stream a response token-by-token; resolves with the full text. */
  streamResponse(opts: AIStreamOptions, onToken: (t: string) => void): Promise<string>
}

// Gemini provider — delegates to the transport in llm.ts (browser-direct in
// preview, secure edge-function gateway in production).
export const GeminiProvider: AIProvider = {
  id: 'gemini',
  streamResponse(opts, onToken) {
    return streamChat({ mode: opts.mode, messages: opts.messages, context: opts.context, signal: opts.signal }, onToken)
  },
}

// The active provider. Point this elsewhere to swap models app-wide.
export const aiProvider: AIProvider = GeminiProvider
