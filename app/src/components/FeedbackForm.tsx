import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FeedbackType } from '../lib/types'
import { Bug, Lightbulb, Pencil } from './Icons'

// Standalone feedback entry point (Settings → "Send feedback"), available to
// every signed-in user — not tied to a specific chat message. Feeds the same
// `feedback` table the Super Admin inbox reads from.
const TYPES: { value: FeedbackType; icon: ReactNode; label: string }[] = [
  { value: 'bug', icon: <Bug size={15} />, label: 'Report a bug' },
  { value: 'feature', icon: <Lightbulb size={15} />, label: 'Suggest a feature' },
  { value: 'general', icon: <Pencil size={15} />, label: 'General feedback' },
]

export function FeedbackForm({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (type: FeedbackType, comment: string) => void | Promise<void>
}) {
  const [type, setType] = useState<FeedbackType>('general')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    if (!comment.trim() || busy) return
    setBusy(true)
    try {
      await onSubmit(type, comment.trim())
      setSent(true)
    } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 70, animation: 'mz-fadein .15s both', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 22, boxShadow: 'var(--shadow-pop)' }}>
        {sent ? (
          <>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Thanks — sent.</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>Your feedback reached the campus admin team.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Send feedback</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>Report a bug, suggest a feature, or just tell us what's on your mind.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              {TYPES.map((t) => {
                const on = type === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, fontSize: 13, border: '1px solid var(--line-strong)', background: on ? 'var(--accent)' : 'var(--paper-app)', color: on ? '#fff' : 'var(--ink)', cursor: 'pointer' }}
                  >
                    <span>{t.icon}</span>{t.label}
                  </button>
                )
              })}
            </div>
            <textarea
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe it here…"
              rows={5}
              style={{ width: '100%', border: '1px solid var(--line-strong)', borderRadius: 12, padding: 12, fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: 'var(--paper-app)', color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 16 }}>
              <button onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 11, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={busy || !comment.trim()} style={{ height: 40, padding: '0 18px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !comment.trim() ? 0.6 : 1 }}>
                {busy ? 'Sending…' : 'Submit feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
