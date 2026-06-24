// Read uploaded files into Attachments the model can actually use.
// - Images (png/jpg/jpeg/webp/gif): sent as vision input (real).
// - Text-extractable (txt/csv/tsv/md/json/log/code): content read and sent.
// - PDF/DOCX/XLSX/PPTX: accepted, but binary extraction needs parser libs
//   (next step) — we tell the user instead of sending fake content.
import type { Attachment } from './llm'

export interface PendingAttachment extends Attachment {
  id: string
  status: 'ready' | 'unsupported'
  note?: string
}

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif)$/i
const TEXT_EXT = /\.(txt|csv|tsv|md|markdown|json|log|ya?ml|xml|html?|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|sql|sh)$/i
const BINARY_DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?)$/i

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'a' + Math.random().toString(36).slice(2))

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}
function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file) })
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
  if (BINARY_DOC_EXT.test(file.name)) {
    return { ...base, kind: 'text', text: '', status: 'unsupported', note: 'Document text extraction (PDF/DOCX/XLSX/PPTX) is coming soon — for now, paste the text or upload an image of it.' }
  }
  return { ...base, kind: 'text', text: '', status: 'unsupported', note: `Unsupported file type: ${file.name}` }
}

export async function readFiles(files: FileList | File[]): Promise<PendingAttachment[]> {
  return Promise.all(Array.from(files).map(readFile))
}

// File picker accept lists.
export const ACCEPT_DOCS = '.txt,.csv,.tsv,.md,.json,.log,.yaml,.yml,.xml,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/*'
export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/gif'
