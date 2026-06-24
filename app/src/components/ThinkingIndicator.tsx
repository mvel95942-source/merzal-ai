import { useEffect, useState } from 'react'

// The signature waiting state: staged phases with an elapsed timer and a
// shimmer skeleton — not a spinner. Resolves into the streamed reply.
const PHASES = ['Reading your message', 'Searching memory', 'Thinking', 'Composing'] as const

export function ThinkingIndicator() {
  const [phase, setPhase] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const tick = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 100)
    const advance = window.setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 850)
    return () => { clearInterval(tick); clearInterval(advance) }
  }, [])

  return (
    <div style={{ animation: 'mz-fadein .3s both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: `mz-pulse 1s ${i * 0.18}s infinite` }} />
          ))}
        </span>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {PHASES[phase]}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{elapsed.toFixed(1)}s</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="skeleton" style={{ height: 13, width: '92%' }} />
        <div className="skeleton" style={{ height: 13, width: '78%' }} />
        <div className="skeleton" style={{ height: 13, width: '85%' }} />
      </div>
    </div>
  )
}
