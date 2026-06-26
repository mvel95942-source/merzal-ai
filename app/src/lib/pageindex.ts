// PageIndex client — Campus mode RAG via PageIndex's OpenAI-compatible API.
// Off by default. Enable with VITE_PAGEINDEX_ENABLED=true and a key in
// VITE_PAGEINDEX_API_KEY. See PAGEINDEX_INTEGRATION.md for the design.
//
// Endpoints we use (all bearer-authenticated):
//   POST /chat/completions   OpenAI-style chat that already retrieves
//   POST /doc                multipart upload (admin)
//   GET  /docs               list (admin)
//   DELETE /doc/{id}         delete (admin)

const KEY = import.meta.env.VITE_PAGEINDEX_API_KEY as string | undefined
const ENABLED = String(import.meta.env.VITE_PAGEINDEX_ENABLED ?? '').toLowerCase() === 'true'
const BASE = (import.meta.env.VITE_PAGEINDEX_BASE_URL as string) || 'https://api.pageindex.ai'

export const pageindexEnabled = () => ENABLED && !!KEY

function auth() {
  if (!KEY) throw new Error('PageIndex key not configured')
  return { Authorization: `Bearer ${KEY}` }
}

export interface PageIndexDoc { id: string; name: string; status: string; createdAt?: string }

export async function piListDocs(): Promise<PageIndexDoc[]> {
  const res = await fetch(`${BASE}/docs?limit=200`, { headers: auth() })
  if (!res.ok) throw new Error(`pageindex /docs ${res.status}`)
  const j = await res.json()
  return (j.documents ?? []).map((d: any) => ({ id: d.id ?? d.doc_id, name: d.name ?? d.title ?? d.filename ?? 'document', status: d.status ?? 'unknown', createdAt: d.createdAt ?? d.created_at }))
}

export async function piUploadDoc(file: File): Promise<{ id: string }> {
  const form = new FormData(); form.append('file', file)
  const res = await fetch(`${BASE}/doc`, { method: 'POST', headers: auth(), body: form })
  if (!res.ok) throw new Error(`pageindex upload ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  return { id: j.doc_id ?? j.id ?? '' }
}

export async function piDeleteDoc(id: string): Promise<void> {
  const res = await fetch(`${BASE}/doc/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth() })
  if (!res.ok && res.status !== 404) throw new Error(`pageindex delete ${res.status}`)
}

// OpenAI-compatible streaming chat. Returns a Response so the existing SSE
// parser in llm.ts can consume it unchanged.
export async function piStreamChat(messages: { role: string; content: string }[], signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify({ stream: true, messages }),
    signal,
  })
}
