import { useState } from 'react'

// Structured feedback collected on thumbs up/down and stored in `message_feedback`.
export function FeedbackModal({ type, onClose, onSubmit }: {
  type: 'up' | 'down'
  onClose: () => void
  onSubmit: (comment: string) => void | Promise<void>
}) {
  const positive = type === 'up'
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const prompts = positive
    ? ['Accurate', 'Clear & well-formatted', 'Helpful detail', 'Exactly what I needed']
    : ['Inaccurate', 'Missing information', 'Bad formatting', 'Off-topic', 'Too long / too short']

  async function submit() {
    setBusy(true)
    try { await onSubmit(comment.trim()) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#00000066', display: 'grid', placeItems: 'center', zIndex: 50, animation: 'mz-fadein .15s both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 22, boxShadow: '0 20px 60px #0006' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--ink)' }}>{positive ? 'What worked well?' : 'What went wrong?'}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
          {positive ? 'Tell us what you liked — it helps us improve.' : 'Your notes help us fix and improve responses.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
          {prompts.map((p) => {
            const on = comment.includes(p)
            return (
              <button
                key={p}
                onClick={() => setComment((c) => (on ? c.replace(new RegExp(`\\s*${p}[.;]?`), '').trim() : (c ? c + '; ' : '') + p))}
                style={{ height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12.5, border: '1px solid var(--line-strong)', background: on ? 'var(--accent)' : 'var(--surface-soft)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' }}
              >
                {p}
              </button>
            )
          })}
        </div>
        <textarea
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={positive ? 'Anything else? (optional)' : 'Describe the issue…'}
          rows={positive ? 3 : 5}
          style={{ width: '100%', border: '1px solid var(--line-strong)', borderRadius: 12, padding: 12, fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: 'var(--surface-soft)', color: 'var(--ink)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 16 }}>
          <button onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 11, border: '1px solid var(--line-strong)', background: 'var(--surface-soft)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {busy ? 'Sending…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}
