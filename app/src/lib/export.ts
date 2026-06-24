// Conversation export — plain text download and print-to-PDF (no libs).
import type { Message } from './types'

function toPlainText(title: string, messages: Message[]): string {
  const lines = [title, '='.repeat(title.length), '']
  for (const m of messages) {
    lines.push(`${m.role === 'user' ? 'You' : 'Assistant'}:`)
    lines.push(m.content, '')
  }
  return lines.join('\n')
}

export function exportText(title: string, messages: Message[]) {
  const blob = new Blob([toPlainText(title, messages)], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${slug(title)}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Open a clean printable view and trigger the browser's print dialog → the user
// picks "Save as PDF". Real export, zero dependencies.
export function exportPdf(title: string, messages: Message[]) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const rows = messages.map((m) => `
    <div class="row ${m.role}">
      <div class="who">${m.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="bubble">${esc(m.content).replace(/\n/g, '<br>')}</div>
    </div>`).join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1a16;max-width:720px;margin:32px auto;padding:0 20px}
      h1{font-size:22px;border-bottom:2px solid #bf5e36;padding-bottom:8px}
      .row{margin:16px 0}
      .who{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9a8f7d;margin-bottom:4px}
      .bubble{white-space:pre-wrap}
      .user .bubble{background:#f4efe6;border:1px solid #e2dccd;border-radius:10px;padding:10px 13px;display:inline-block}
      .foot{margin-top:32px;color:#9a8f7d;font-size:11px;border-top:1px solid #eee;padding-top:10px}
    </style></head><body>
    <h1>${esc(title)}</h1>${rows}
    <div class="foot">Exported from Merzal AI</div>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
  w.document.close()
}

const slug = (s: string) => (s || 'conversation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'conversation'
