// The download affordance for a document the AI wrote.
//
// Deliberately a LINK, not a card: it renders inline, exactly where the model
// put the tag, so a reply reads "here's your guide" → link → "it includes: …".
// A boxed card forced every file to the bottom and broke that narration.
//
// Bytes are built lazily on first click (the writers are dynamic imports — see
// filegen.ts) and cached, so a second download is instant. Size is unknown
// until that first build, so it appears afterwards rather than blocking a reply
// on work the user may never ask for.
import { useState } from 'react'
import { buildFile, downloadBlob, fullName, humanSize, LABEL } from '../lib/filegen'
import type { FileSpec } from '../lib/filegen'
import { FileDoc, Warning } from './Icons'

type State = 'idle' | 'building' | 'done' | 'error'

// A hint of the format, so a PDF and a Word doc are told apart at a glance.
const TINT: Record<string, string> = {
  pdf: '#c0392b', docx: '#2b579a', xlsx: '#1d6f42',
  csv: '#1d6f42', md: '#5c5449', txt: '#5c5449', html: '#bf5e36',
}

export function FileCard({ spec }: { spec: FileSpec }) {
  const [state, setState] = useState<State>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState('')
  const name = fullName(spec)

  async function download() {
    if (state === 'building') return
    if (blob) { // already built once — don't pay for it again
      downloadBlob(blob, name)
      return
    }
    setState('building')
    try {
      const built = await buildFile(spec)
      setBlob(built)
      downloadBlob(built, name)
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build this file')
      setState('error')
    }
  }

  const failed = state === 'error'
  const meta = failed ? error
    : state === 'building' ? 'preparing…'
    : blob ? `${LABEL[spec.format]} · ${humanSize(blob.size)}`
    : LABEL[spec.format]

  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
      <button
        onClick={download}
        disabled={state === 'building'}
        title={failed ? error : `Download ${name}`}
        aria-label={`Download ${name}`}
        className="mz-filelink"
        style={{ color: failed ? 'var(--danger)' : undefined }}
      >
        <span aria-hidden style={{ color: failed ? 'var(--danger)' : TINT[spec.format] ?? 'var(--accent)', display: 'inline-flex', flex: 'none' }}>
          {failed ? <Warning size={16} /> : <FileDoc size={16} />}
        </span>
        <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{name}</span>
      </button>
      <span style={{ fontSize: 11.5, color: failed ? 'var(--danger)' : 'var(--faint)' }}>
        {meta}{failed ? ' — click to retry' : ''}
      </span>
    </span>
  )
}
