// Strip Gemma's <thought>…</thought> reasoning from a complete response.
// Used both when saving (llm.ts) and at render time (defensive — cleans any
// already-saved message that still contains a thought block).
export function stripThoughts(raw: string): string {
  if (!raw || raw.indexOf('<thought') === -1) return raw
  let s = raw
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .replace(/<thought>[\s\S]*$/g, '')
    .replace(/<\/?thought>/g, '')
    .replace(/^\s+/, '')
    .trim()
  if (s) return s
  // Answer was buried inside the thought — recover the last sentence-like line.
  const inner = raw.replace(/<\/?thought>/g, '')
  const lines = inner.split('\n')
    .map((l) => l.trim().replace(/^[*\-•]\s*/, '').replace(/^["“]|["”]$/g, '').trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (/[.!?]$/.test(l) && l.length > 12 && !/^(user|task|goal|request|constraint|input|output|step|reasoning|analysis)\b[:.]?/i.test(l)) return l
  }
  return lines[lines.length - 1] || raw.trim()
}
