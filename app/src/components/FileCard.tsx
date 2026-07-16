// Download card for a file the AI generated. Rendered in place of the
// <merzal-file> block that produced it.
//
// The bytes are built lazily on the first click (the writers are dynamic
// imports — see filegen.ts), then cached on the component so a second download
// is instant. Size is unknown until that first build, so the card shows the
// format label up front and fills the size in afterwards rather than blocking
// the whole reply on work the user may never ask for.
import { useState } from 'react'
import { buildFile, downloadBlob, fullName, humanSize, LABEL } from '../lib/filegen'
import type { FileSpec } from '../lib/filegen'
import { Check, FileDoc, Warning } from './Icons'

type State = 'idle' | 'building' | 'done' | 'error'

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
    if (blob) { // already built once — no need to pay for it again
      downloadBlob(blob, name)
      setState('done')
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

  const tint = TINT[spec.format] ?? 'var(--accent)'
  const sub =
    state === 'building' ? 'Preparing…'
    : state === 'error' ? error
    : `${LABEL[spec.format]}${blob ? ` · ${humanSize(blob.size)}` : ''}`

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0',
        padding: '11px 13px', borderRadius: 14, maxWidth: 420,
        border: '1px solid var(--line-strong)', background: 'var(--surface)',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 10, flex: 'none',
          background: 'var(--surface-soft)', color: state === 'error' ? 'var(--danger)' : tint,
        }}
      >
        {state === 'error' ? <Warning size={19} /> : <FileDoc size={19} />}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span
          title={name}
          style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {name}
        </span>
        <span style={{ fontSize: 11.5, color: state === 'error' ? 'var(--danger)' : 'var(--muted)' }}>{sub}</span>
      </span>

      <button
        onClick={download}
        disabled={state === 'building'}
        aria-label={`Download ${name}`}
        style={{
          height: 32, padding: '0 14px', borderRadius: 999, border: 'none', flex: 'none',
          background: state === 'done' ? 'var(--surface-soft)' : 'var(--ink)',
          color: state === 'done' ? 'var(--ink)' : 'var(--paper)',
          fontSize: 12.5, fontWeight: 600,
          cursor: state === 'building' ? 'default' : 'pointer',
          opacity: state === 'building' ? 0.6 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {state === 'done' ? <><Check size={14} /> Saved</> : state === 'error' ? 'Retry' : state === 'building' ? 'Building…' : 'Download'}
      </button>
    </div>
  )
}
