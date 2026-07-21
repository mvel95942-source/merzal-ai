// Read uploaded files into Attachments the model can actually use.
// - Images (png/jpg/jpeg/webp/gif): sent as vision input (real).
// - Text-extractable (txt/csv/tsv/md/json/log/code): content read and sent.
// - PDF / DOCX / XLSX: text is extracted in-browser (pdfjs / mammoth / xlsx) and
//   sent to the model. The parsers are lazy-loaded (dynamic import) so they only
//   download when a matching file is actually uploaded — never on first paint.
// - PPT/PPTX and legacy .doc/.xls: no reliable in-browser parser yet — we tell
//   the user instead of sending fake/empty content.
import type { Attachment } from './llm'

export interface PendingAttachment extends Attachment {
  id: string
  status: 'ready' | 'unsupported'
  note?: string
}

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml|heic|heif)$/i
// Anything text-extractable is read as text and sent to the model. Kept broad so
// students can upload code, config, and data files of any common language.
const TEXT_EXT = /\.(txt|text|csv|tsv|md|markdown|rst|json|jsonc|log|ya?ml|xml|html?|css|scss|sass|less|ini|toml|conf|cfg|env|properties|gradle|makefile|dockerfile|js|mjs|cjs|ts|tsx|jsx|py|pyw|java|kt|kts|swift|c|h|cpp|cc|cxx|hpp|cs|go|rs|rb|php|pl|lua|r|m|scala|dart|sql|sh|bash|zsh|ps1|bat|vue|svelte|tex)$/i

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'a' + Math.random().toString(36).slice(2))

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}
function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file) })
}

// ── In-browser document text extraction (lazy-loaded parsers) ──────────────
async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Vite serves the worker as a hashed URL asset; kept out of the main bundle.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  return pages.join('\n\n').trim()
}

async function extractDocx(file: File): Promise<string> {
  const mod = await import('mammoth')
  const mammoth = (mod as { extractRawText?: typeof import('mammoth').extractRawText; default?: typeof import('mammoth') }).extractRawText
    ? (mod as typeof import('mammoth'))
    : ((mod as { default: typeof import('mammoth') }).default)
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return value.trim()
}

async function extractXlsx(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: 'array' })
  return wb.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n').trim()
}

// Route a binary document to its extractor. Returns extracted text, or throws so
// the caller can mark it unsupported (never sends fake content).
function extractDoc(file: File): Promise<string> | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return extractPdf(file)
  if (n.endsWith('.docx')) return extractDocx(file)
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return extractXlsx(file)
  return null // .doc / .ppt / .pptx — no reliable browser parser
}

export async function readFile(file: File): Promise<PendingAttachment> {
  const base = { id: uid(), name: file.name, mime: file.type || 'application/octet-stream' }
  if (IMAGE_MIME.test(file.type)) {
    return { ...base, kind: 'image', dataUrl: await readAsDataURL(file), status: 'ready' }
  }
  if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
    const text = await readAsText(file)
    return { ...base, kind: 'text', text, status: 'ready' }
  }
  const extractor = extractDoc(file)
  if (extractor) {
    try {
      const text = await extractor
      if (text) return { ...base, kind: 'text', text, status: 'ready' }
      return { ...base, kind: 'text', text: '', status: 'unsupported', note: `Couldn't find readable text in ${file.name} (it may be scanned/image-only — upload it as an image instead).` }
    } catch {
      return { ...base, kind: 'text', text: '', status: 'unsupported', note: `Couldn't read ${file.name}. Try uploading it as an image, or paste the text.` }
    }
  }
  // Last resort: many "unknown" files (odd MIME, no extension) are really UTF-8
  // text — try to read them as text before giving up, so uploads rarely fail.
  try {
    const text = await readAsText(file)
    // Heuristic: real text has few NUL/replacement chars. Binary read-as-text is
    // full of them — reject those so we don't feed the model garbage.
    // eslint-disable-next-line no-control-regex
    const bad = (text.match(/[\u0000\uFFFD]/g) || []).length
    if (text && bad / text.length < 0.02) {
      return { ...base, kind: 'text', text, status: 'ready' }
    }
  } catch { /* fall through to the unsupported note */ }
  return { ...base, kind: 'text', text: '', status: 'unsupported', note: `Couldn't read ${file.name} as text. Supported: images, PDF, Word (.docx), Excel (.xlsx/.xls), and text/code/data files. For .ppt/.pptx or legacy .doc, export to PDF and upload that.` }
}

export async function readFiles(files: FileList | File[]): Promise<PendingAttachment[]> {
  return Promise.all(Array.from(files).map(readFile))
}

// File picker accept lists. We list BOTH extensions and MIME types: some
// platforms (notably mobile) filter by MIME and hide extension-only entries,
// which is why Excel/Word files could seem "un-selectable" before. Text/code
// files fall under `text/*` plus explicit extensions for the ones the OS
// mislabels (e.g. .py reported as application/octet-stream).
export const ACCEPT_DOCS = [
  // Documents with real extractors
  '.pdf,.docx,.xls,.xlsx',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // Text / data / config
  '.txt,.text,.csv,.tsv,.md,.markdown,.rst,.json,.jsonc,.log,.yaml,.yml,.xml,.ini,.toml,.conf,.cfg,.env',
  'text/*,application/json',
  // Code (broad set so students can upload source of any common language)
  '.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.pyw,.java,.kt,.swift,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.rb,.php,.lua,.r,.dart,.scala,.sql,.sh,.bash,.ps1,.bat,.html,.htm,.css,.scss,.vue,.svelte',
].join(',')
export const ACCEPT_IMAGES = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.heif'
