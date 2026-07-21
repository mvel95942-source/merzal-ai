// Merzal AI — DuckDuckGo web-search connector (backend for World/General mode).
//
// Why a backend function: DuckDuckGo's HTML endpoint blocks cross-origin (CORS)
// requests, so the browser can't call it directly; and parsing search HTML
// shouldn't ship to every client. This edge function fetches results
// server-side and returns a small, clean JSON list of {title, url, snippet}.
// No API key required — DuckDuckGo's HTML endpoint is open (and free). The
// World retriever (app/src/lib/websearch.ts) calls this and injects the results
// as grounding context so answers reflect live web info and cite sources.
//
// verify_jwt: callable with the project anon key (sent as Authorization by the
// client), so it works for both signed-in and anonymous preview users.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A real browser UA — DuckDuckGo's HTML endpoint returns an empty page to
// obvious bots.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface Result { title: string; url: string; snippet: string }

// Strip inline tags (<b> highlights) and decode the HTML entities DuckDuckGo
// emits, so titles/snippets are clean text for the model.
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;|&#47;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

// DuckDuckGo wraps result links as //duckduckgo.com/l/?uddg=<encoded>&rut=…
// Unwrap to the real destination URL.
function unwrap(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { /* fall through */ } }
  if (href.startsWith('//')) return 'https:' + href
  return href
}

async function ddgSearch(query: string, max: number, signal: AbortSignal): Promise<Result[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
    signal,
  })
  if (!res.ok) return []
  const html = await res.text()

  // Sequential scan: a result is a result__a link followed by its
  // result__snippet. Zipping this way is robust to ads/empty blocks that would
  // desync two independent arrays.
  const tokenRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  const results: Result[] = []
  for (let m = tokenRe.exec(html); m; m = tokenRe.exec(html)) {
    if (m[1] !== undefined) {
      const url = unwrap(m[1])
      const title = clean(m[2])
      if (title && /^https?:/i.test(url)) results.push({ title, url, snippet: '' })
    } else if (m[3] !== undefined && results.length) {
      const last = results[results.length - 1]
      if (!last.snippet) last.snippet = clean(m[3])
    }
    if (results.length >= max && results[results.length - 1].snippet) break
  }
  return results.slice(0, max)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ results: [], error: 'POST only' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const query = String(body.q ?? '').trim().slice(0, 400)
    if (!query) return json({ query: '', results: [] })
    const max = Math.min(Math.max(Number(body.max) || 5, 1), 8)
    // Bound the upstream call so a slow DuckDuckGo never hangs a chat send.
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const results = await ddgSearch(query, max, ctrl.signal)
      return json({ query, results })
    } finally {
      clearTimeout(t)
    }
  } catch (e) {
    // Never fail the caller — the chat degrades gracefully to model knowledge.
    return json({ results: [], error: String(e) })
  }
})
