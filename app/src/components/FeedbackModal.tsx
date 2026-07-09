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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#1d1a1688', display: 'grid', placeItems: 'center', zIndex: 50, animation: 'mz-fadein .15s both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)', background: 'var(--paper-panel, #f6f3ec)', borderRadius: 18, padding: 22, boxShadow: '0 20px 60px #0003' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{positive ? 'What worked well?' : 'What went wrong?'}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted, #7a7166)' }}>
          {positive ? 'Tell us what you liked — it helps us improve.' : 'Your notes help us fix and improve responses.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
          {prompts.map((p) => {
            const on = comment.includes(p)
            return (
              <button
                key={p}
                onClick={() => setComment((c) => (on ? c.replace(new RegExp(`\\s*${p}[.;]?`), '').trim() : (c ? c + '; ' : '') + p))}
                style={{ height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12.5, border: '1px solid var(--line-strong, #ddd4c5)', background: on ? 'var(--accent, #bf5e36)' : '#fff', color: on ? '#fff' : 'var(--ink, #1d1a16)', cursor: 'pointer' }}
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
          style={{ width: '100%', border: '1px solid var(--line-strong, #ddd4c5)', borderRadius: 12, padding: 12, fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: '#fff', color: 'var(--ink, #1d1a16)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 16 }}>
          <button onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 11, border: '1px solid var(--line-strong, #ddd4c5)', background: '#fff', fontSize: 14, fontWeight: 600 }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--accent, #bf5e36)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            {busy ? 'Sending…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}
