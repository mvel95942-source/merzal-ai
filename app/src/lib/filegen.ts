// On-demand document generation. The model answers a "make me a PDF/Word doc"
// request by wrapping the document body in a <merzal-file> tag (see the prompt
// contract in llm.ts). We parse those tags out of the reply, render a download
// card in their place, and build the real bytes IN THE BROWSER on click.
//
// Why client-side: no bucket, no RLS, no expiry job, no storage bill, and the
// document never leaves the device. The heavy writers (jspdf/docx/xlsx) are
// behind dynamic import() so they cost nothing until a file is actually built.
//
// Tags are used instead of ``` fences on purpose: a generated document very
// often CONTAINS fenced code, which would terminate a fence-delimited block
// early. Tags nest safely.

export type FileFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'md' | 'txt' | 'html'

export interface FileSpec {
  /** Stable within a message: `${messageId}:${index}`. */
  id: string
  format: FileFormat
  /** Base name, no extension. Already slugified. */
  filename: string
  title: string
  /** Markdown body of the document. */
  content: string
}

const FORMATS: FileFormat[] = ['pdf', 'docx', 'xlsx', 'csv', 'md', 'txt', 'html']
const EXT: Record<FileFormat, string> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', csv: 'csv', md: 'md', txt: 'txt', html: 'html' }
export const MIME: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
}
export const LABEL: Record<FileFormat, string> = {
  pdf: 'PDF document', docx: 'Word document', xlsx: 'Excel spreadsheet',
  csv: 'CSV file', md: 'Markdown file', txt: 'Text file', html: 'Web page',
}

// ── Parsing ────────────────────────────────────────────────────────────
const BLOCK_RE = /<merzal-file\b([^>]*)>([\s\S]*?)<\/merzal-file>/g
const OPEN_TAG = '<merzal-file'

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

export function slug(s: string, fallback = 'document'): string {
  const v = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return v || fallback
}

/**
 * Pull every complete <merzal-file> block out of an assistant reply.
 * Returns the specs plus the prose with those blocks removed, so the chat
 * bubble shows the model's explanation and a card — never raw tag soup.
 */
export function parseFiles(content: string, messageId: string): { files: FileSpec[]; text: string } {
  const files: FileSpec[] = []
  let i = 0
  const text = content.replace(BLOCK_RE, (_all, rawAttrs: string, body: string) => {
    const a = attrs(rawAttrs)
    const format = (a.format || '').toLowerCase() as FileFormat
    if (!FORMATS.includes(format)) return '' // unknown format → drop the tag, keep the prose
    const title = (a.title || 'Document').trim()
    files.push({
      id: `${messageId}:${i++}`,
      format,
      filename: slug(a.filename || title),
      title,
      content: body.trim(),
    })
    return '' // the card replaces it
  })
  return { files, text: text.replace(/\n{3,}/g, '\n\n').trim() }
}

/**
 * Prepare a STILL-STREAMING reply for display: hide every trace of file markup
 * and report whether a document is being written (so the UI can say so).
 *
 * The tag arrives one character at a time, so three states must all be caught
 * — each is otherwise briefly on screen as raw markup:
 *   1. `<merzal-file …>…</merzal-file>`   — complete
 *   2. `<merzal-file format="pd`          — open tag itself still arriving
 *   3. `<merzal-fi`                        — the tag NAME half-arrived
 * Matching only "a complete opening tag" (which needs its `>`) misses 2 and 3.
 */
export function stripStreamingFiles(content: string): { text: string; writing: boolean } {
  let writing = false
  let out = content.replace(BLOCK_RE, () => { writing = true; return '' })

  // Complete blocks are gone, so any REMAINING open tag is by definition still
  // streaming: drop it and everything after. Uses indexOf, not lastIndexOf —
  // the document body itself may contain '<'.
  const open = out.indexOf(OPEN_TAG)
  if (open !== -1) {
    writing = true
    out = out.slice(0, open)
  } else {
    // Tag name not fully arrived yet: a trailing '<' that could still grow into
    // '<merzal-file'. Real prose (`5 < 10`, `<br>`) is not a prefix, so it stays.
    const lt = out.lastIndexOf('<')
    if (lt !== -1 && OPEN_TAG.startsWith(out.slice(lt))) {
      writing = true
      out = out.slice(0, lt)
    }
  }
  return { text: out.trimEnd(), writing }
}

export function fullName(spec: FileSpec): string {
  return `${spec.filename}.${EXT[spec.format]}`
}

// ── Markdown → blocks ──────────────────────────────────────────────────
// A deliberately small subset: what a study note / report actually uses.
// Shared by the PDF and Word writers so both render identically.

export interface Inline { text: string; bold?: boolean; italic?: boolean; code?: boolean }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; runs: Inline[] }
  | { type: 'p'; runs: Inline[] }
  | { type: 'bullet'; runs: Inline[]; ordered: boolean; marker: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; runs: Inline[] }
  | { type: 'hr' }
  | { type: 'table'; rows: string[][] }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  // Order matters: ** before *, and ` is literal-until-close.
  const re = /(\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`(.+?)`)/g
  let last = 0
  for (const m of s.matchAll(re)) {
    const at = m.index!
    if (at > last) out.push({ text: s.slice(last, at) })
    if (m[2] !== undefined || m[3] !== undefined) out.push({ text: m[2] ?? m[3], bold: true })
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ text: m[4] ?? m[5], italic: true })
    else out.push({ text: m[6], code: true })
    last = at + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out.length ? out : [{ text: s }]
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isDivider = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-')
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flush = () => {
    if (!para.length) return
    blocks.push({ type: 'p', runs: parseInline(para.join(' ').trim()) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Fenced code — consume verbatim to the closing fence.
    const fence = line.match(/^\s*```/)
    if (fence) {
      flush()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      blocks.push({ type: 'code', text: buf.join('\n') })
      continue
    }

    // Table — header row + divider + body.
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flush()
      const rows = [cells(line)]
      i += 2
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]))
      i--
      blocks.push({ type: 'table', rows })
      continue
    }

    if (!line.trim()) { flush(); continue }

    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flush()
      blocks.push({ type: 'heading', level: m[1].length as 1 | 2 | 3, runs: parseInline(m[2].trim()) })
    } else if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.trim().length <= 6) {
      flush()
      blocks.push({ type: 'hr' })
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flush()
      blocks.push({ type: 'quote', runs: parseInline(m[1]) })
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flush()
      blocks.push({ type: 'bullet', ordered: false, marker: '•', runs: parseInline(m[1]) })
    } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      flush()
      blocks.push({ type: 'bullet', ordered: true, marker: `${m[1]}.`, runs: parseInline(m[2]) })
    } else {
      para.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** Rows for a spreadsheet: a markdown table if present, else CSV-ish lines. */
function toRows(md: string): string[][] {
  const table = parseMarkdown(md).find((b) => b.type === 'table')
  if (table && table.type === 'table') return table.rows
  return md.trim().split('\n').filter(Boolean).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
}

const plain = (runs: Inline[]) => runs.map((r) => r.text).join('')

// ── Writers ────────────────────────────────────────────────────────────

async function buildPdf(spec: FileSpec): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 56              // page margin
  const W = doc.internal.pageSize.getWidth() - M * 2
  const BOTTOM = doc.internal.pageSize.getHeight() - M
  let y = M

  const room = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M } }

  // Render one line of inline runs, wrapping by word and honouring bold/italic.
  const writeRuns = (runs: Inline[], size: number, indent = 0, baseStyle = 'normal') => {
    const maxW = W - indent
    let x = M + indent
    doc.setFontSize(size)
    const lineH = size * 1.45
    room(lineH)
    for (const run of runs) {
      const style = run.bold ? (baseStyle === 'italic' ? 'bolditalic' : 'bold') : run.italic ? 'italic' : baseStyle
      doc.setFont(run.code ? 'courier' : 'helvetica', style)
      for (const word of run.text.split(/(\s+)/)) {
        if (!word) continue
        const w = doc.getTextWidth(word)
        if (x + w > M + indent + maxW && /\S/.test(word)) {
          y += lineH; x = M + indent; room(lineH)
        }
        if (x === M + indent && !/\S/.test(word)) continue // no leading space after a wrap
        doc.text(word, x, y)
        x += w
      }
    }
    y += lineH
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  const titleLines = doc.splitTextToSize(spec.title, W) as string[]
  for (const l of titleLines) { room(26); doc.text(l, M, y); y += 26 }
  doc.setDrawColor(191, 94, 54); doc.setLineWidth(1.4)
  doc.line(M, y - 12, M + W, y - 12)
  y += 12

  for (const b of parseMarkdown(spec.content)) {
    switch (b.type) {
      case 'heading': {
        y += b.level === 1 ? 14 : 10
        writeRuns(b.runs, b.level === 1 ? 16 : b.level === 2 ? 14 : 12.5, 0, 'bold')
        y += 3
        break
      }
      case 'p':
        writeRuns(b.runs, 11)
        y += 5
        break
      case 'bullet': {
        const lineH = 11 * 1.45
        room(lineH)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
        doc.text(b.marker, M + 8, y)
        writeRuns(b.runs, 11, 30)
        y += 2
        break
      }
      case 'quote': {
        const top = y - 10
        writeRuns(b.runs, 11, 18, 'italic')
        doc.setDrawColor(191, 94, 54); doc.setLineWidth(2.5)
        doc.line(M + 4, top, M + 4, y - 12)
        y += 5
        break
      }
      case 'code': {
        doc.setFont('courier', 'normal'); doc.setFontSize(9.5)
        const ls = doc.splitTextToSize(b.text, W - 20) as string[]
        room(ls.length * 13 + 14)
        doc.setFillColor(246, 243, 237)
        doc.rect(M, y - 10, W, ls.length * 13 + 12, 'F')
        for (const l of ls) { doc.text(l, M + 10, y); y += 13 }
        y += 12
        break
      }
      case 'hr':
        room(16)
        doc.setDrawColor(220, 214, 202); doc.setLineWidth(1)
        doc.line(M, y - 4, M + W, y - 4)
        y += 12
        break
      case 'table': {
        const cols = b.rows[0]?.length || 1
        const cw = W / cols
        doc.setFontSize(9.5)
        for (const [ri, row] of b.rows.entries()) {
          const cellLines = row.map((c) => doc.splitTextToSize(c, cw - 12) as string[])
          const h = Math.max(...cellLines.map((l) => l.length)) * 12 + 9
          room(h)
          if (ri === 0) { doc.setFillColor(244, 239, 230); doc.rect(M, y - 10, W, h, 'F') }
          doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal')
          cellLines.forEach((ls, ci) => ls.forEach((l, li) => doc.text(l, M + ci * cw + 6, y + li * 12)))
          doc.setDrawColor(226, 220, 205); doc.setLineWidth(0.5)
          doc.line(M, y + h - 10, M + W, y + h - 10)
          y += h
        }
        y += 10
        break
      }
    }
  }

  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(154, 143, 125)
    doc.text(`Generated by Merzal AI · Page ${p} of ${n}`, M, BOTTOM + 26)
  }
  return doc.output('blob')
}

async function buildDocx(spec: FileSpec): Promise<Blob> {
  const D = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = D

  const runs = (rs: Inline[], opts: { italics?: boolean } = {}) =>
    rs.map((r) => new TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic || opts.italics,
      font: r.code ? 'Consolas' : undefined,
      shading: r.code ? { fill: 'F1EDE4' } : undefined,
    }))

  const children: InstanceType<typeof Paragraph | typeof Table>[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 240 }, children: [new TextRun({ text: spec.title, bold: true })] }),
  ]

  for (const b of parseMarkdown(spec.content)) {
    switch (b.type) {
      case 'heading':
        children.push(new Paragraph({
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: runs(b.runs),
        }))
        break
      case 'p':
        children.push(new Paragraph({ spacing: { after: 120 }, children: runs(b.runs) }))
        break
      case 'bullet':
        children.push(new Paragraph({
          ...(b.ordered ? { numbering: { reference: 'mz-ol', level: 0 } } : { bullet: { level: 0 } }),
          spacing: { after: 60 },
          children: runs(b.runs),
        }))
        break
      case 'quote':
        children.push(new Paragraph({
          indent: { left: 360 }, spacing: { after: 120 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BF5E36', space: 12 } },
          children: runs(b.runs, { italics: true }),
        }))
        break
      case 'code':
        children.push(new Paragraph({
          shading: { fill: 'F6F3ED' }, spacing: { after: 120 },
          children: b.text.split('\n').flatMap((l, i) => [
            ...(i ? [new TextRun({ break: 1 })] : []),
            new TextRun({ text: l, font: 'Consolas', size: 19 }),
          ]),
        }))
        break
      case 'hr':
        children.push(new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DCD6CA', space: 8 } }, children: [] }))
        break
      case 'table':
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map((row, ri) => new TableRow({
            children: row.map((c) => new TableCell({
              shading: ri === 0 ? { fill: 'F4EFE6' } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })],
            })),
          })),
        }))
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
        break
    }
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 360 },
    children: [new TextRun({ text: 'Generated by Merzal AI', color: '9A8F7D', size: 17 })],
  }))

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'mz-ol',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{ children }],
  })
  return Packer.toBlob(doc)
}

async function buildXlsx(spec: FileSpec): Promise<Blob> {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(toRows(spec.content))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, spec.title.slice(0, 28) || 'Sheet1')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], { type: MIME.xlsx })
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function buildHtml(spec: FileSpec): Blob {
  const html = (rs: Inline[]) => rs.map((r) => {
    const t = esc(r.text)
    if (r.code) return `<code>${t}</code>`
    if (r.bold) return `<strong>${t}</strong>`
    if (r.italic) return `<em>${t}</em>`
    return t
  }).join('')

  const body = parseMarkdown(spec.content).map((b) => {
    switch (b.type) {
      case 'heading': return `<h${b.level}>${html(b.runs)}</h${b.level}>`
      case 'p': return `<p>${html(b.runs)}</p>`
      case 'bullet': return `<li>${html(b.runs)}</li>`
      case 'quote': return `<blockquote>${html(b.runs)}</blockquote>`
      case 'code': return `<pre><code>${esc(b.text)}</code></pre>`
      case 'hr': return '<hr>'
      case 'table': return `<table>${b.rows.map((r, i) => `<tr>${r.map((c) => `<${i ? 'td' : 'th'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`
    }
  }).join('\n')

  return new Blob([`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.title)}</title><style>
body{font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1a16;max-width:760px;margin:40px auto;padding:0 20px}
h1{border-bottom:2px solid #bf5e36;padding-bottom:8px}
code{background:#f1ede4;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace}
pre{background:#f6f3ed;padding:14px;border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}
blockquote{border-left:3px solid #bf5e36;margin:0;padding:2px 16px;color:#5c5449;font-style:italic}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2dccd;padding:8px 10px;text-align:left}th{background:#f4efe6}
hr{border:none;border-top:1px solid #dcd6ca}
.foot{margin-top:40px;color:#9a8f7d;font-size:12px;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<h1>${esc(spec.title)}</h1>
${body}
<div class="foot">Generated by Merzal AI</div>
</body></html>`], { type: MIME.html })
}

function buildCsv(spec: FileSpec): Blob {
  const csv = toRows(spec.content)
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n')
  return new Blob([csv], { type: MIME.csv })
}

function buildTxt(spec: FileSpec): Blob {
  const out = [spec.title, '='.repeat(spec.title.length), '']
  for (const b of parseMarkdown(spec.content)) {
    switch (b.type) {
      case 'heading': out.push('', plain(b.runs).toUpperCase(), '-'.repeat(plain(b.runs).length)); break
      case 'p': out.push(plain(b.runs), ''); break
      case 'bullet': out.push(`  ${b.marker} ${plain(b.runs)}`); break
      case 'quote': out.push(`  | ${plain(b.runs)}`, ''); break
      case 'code': out.push(...b.text.split('\n').map((l) => '    ' + l), ''); break
      case 'hr': out.push('-'.repeat(60), ''); break
      case 'table': out.push(...b.rows.map((r) => r.join('\t')), ''); break
    }
  }
  return new Blob([out.join('\n')], { type: MIME.txt })
}

/** Build the real bytes. Heavy writers load on demand. */
export async function buildFile(spec: FileSpec): Promise<Blob> {
  switch (spec.format) {
    case 'pdf': return buildPdf(spec)
    case 'docx': return buildDocx(spec)
    case 'xlsx': return buildXlsx(spec)
    case 'csv': return buildCsv(spec)
    case 'html': return buildHtml(spec)
    case 'txt': return buildTxt(spec)
    case 'md': return new Blob([`# ${spec.title}\n\n${spec.content}\n`], { type: MIME.md })
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
