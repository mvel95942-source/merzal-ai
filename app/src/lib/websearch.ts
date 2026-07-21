// Frontend client for the DuckDuckGo web-search edge function.
// Used by the World/General-mode knowledge retriever to ground answers in live
// web results. Always resolves (never throws): on any error the chat simply
// falls back to the model's own knowledge.
import { supabase } from './supabase'

export interface WebResult { title: string; url: string; snippet: string }

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export async function webSearch(query: string, max = 5, signal?: AbortSignal): Promise<WebResult[]> {
  const q = (query || '').trim()
  if (!q || !import.meta.env.VITE_SUPABASE_URL) return []
  try {
    // Signed-in users send their session token; anonymous preview uses the anon
    // key. Either is a valid JWT for the Supabase gateway.
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? ANON
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ q, max }),
      signal,
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.results) ? (json.results as WebResult[]) : []
  } catch {
    return []
  }
}
