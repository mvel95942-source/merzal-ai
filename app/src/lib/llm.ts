// Pluggable LLM gateway. Default targets an on-prem vLLM / Ollama-compatible
// OpenAI streaming endpoint. If no endpoint is configured, a built-in stub
// streams a canned reply so the whole UX is demonstrable offline.
import type { ChatMode, Message } from './types'

export interface LLMRequest {
  mode: ChatMode
  messages: Pick<Message, 'role' | 'content'>[]
  // Retrieved campus knowledge + persistent memory, injected as grounding.
  context?: string
  signal?: AbortSignal
}

export interface LLMProvider {
  stream(req: LLMRequest, onToken: (t: string) => void): Promise<string>
}

const ENDPOINTS: Record<ChatMode, string | undefined> = {
  campus: import.meta.env.VITE_LLM_CAMPUS_ENDPOINT as string | undefined,
  world: import.meta.env.VITE_LLM_WORLD_ENDPOINT as string | undefined,
}

// Parse an OpenAI-style SSE stream (`data: {json}\n\n`, terminated by `[DONE]`).
async function streamOpenAISSE(
  res: Response,
  onToken: (t: string) => void,
): Promise<string> {
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
          json.response ?? // Ollama native
          ''
        if (tok) {
          full += tok
          onToken(tok)
        }
      } catch {
        // Non-JSON chunk (e.g. raw text endpoint) — treat as a token.
        full += payload
        onToken(payload)
      }
    }
  }
  return full
}

class HttpProvider implements LLMProvider {
  async stream(req: LLMRequest, onToken: (t: string) => void): Promise<string> {
    const endpoint = ENDPOINTS[req.mode]
    if (!endpoint) return stubProvider.stream(req, onToken)

    const system =
      req.mode === 'campus'
        ? 'You are a private campus assistant running on the university\'s own servers. Ground answers in the provided campus context. Make clear the data is the college\'s own and stays on campus.'
        : 'You are a helpful assistant.'

    const body = {
      stream: true,
      messages: [
        { role: 'system', content: system + (req.context ? `\n\nContext:\n${req.context}` : '') },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    })
    if (!res.ok || !res.body) throw new Error(`LLM endpoint ${res.status}`)
    return streamOpenAISSE(res, onToken)
  }
}

// Canned, context-aware stub so the staged thinking + word-reveal UX works
// with zero backend. Streams word-by-word at a natural cadence.
const stubProvider: LLMProvider = {
  async stream(req, onToken) {
    const last = req.messages[req.messages.length - 1]?.content ?? ''
    const reply = cannedReply(last, req.mode)
    const words = reply.split(/(\s+)/)
    let full = ''
    for (const w of words) {
      if (req.signal?.aborted) break
      full += w
      onToken(w)
      await new Promise((r) => setTimeout(r, 18 + Math.min(60, w.length * 6)))
    }
    return full
  },
}

function cannedReply(q: string, mode: ChatMode): string {
  const lower = q.toLowerCase()
  if (mode === 'campus' && /add\/?drop|deadline/.test(lower)) {
    return "Add/drop for the spring term closes on Friday, January 31 at 11:59 PM. After that date, dropping a course leaves a “W” on your transcript instead of removing it.\n\nSince you may be in an Engineering program, remember that dropping below 12 credits can affect both your full-time status and any merit aid tied to it. Want me to pull up the official academic calendar?"
  }
  if (/financial aid|fafsa|scholarship/.test(lower)) {
    return 'To apply for financial aid, submit the FAFSA (or your institution\'s aid form) through the financial aid portal. Priority deadlines are usually in early spring. I keep this guidance grounded in your college\'s own published policies, on campus.'
  }
  if (/photosynthesis/.test(lower)) {
    return 'Photosynthesis is how plants turn sunlight, water, and carbon dioxide into glucose and oxygen. The overall equation: 6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂. Want the light reactions vs. the Calvin cycle broken down?'
  }
  return `Here's what I can tell you${mode === 'campus' ? ' from your campus knowledge base' : ''}. This is a private, on-premises preview reply — wire up an LLM endpoint in \`.env.local\` to stream real answers. Your question was: “${q.trim()}”.`
}

export const llm: LLMProvider = new HttpProvider()
