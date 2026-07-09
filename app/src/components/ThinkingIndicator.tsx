import { useEffect, useState } from 'react'

// Premium waiting state: staged phase labels + pulsing glow dots + a shimmer
// skeleton — NO timer, no seconds, no tokens, no progress % (per the product
// spec's "AI Chat Experience"). It simply resolves into the streamed reply.
const PHASES = ['Thinking', 'Searching knowledge', 'Composing answer'] as const

export function ThinkingIndicator() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const advance = window.setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 1100)
    return () => clearInterval(advance)
  }, [])

  return (
    <div style={{ animation: 'mz-fadein .3s both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px 1px var(--accent-soft)', animation: `mz-pulse 1s ${i * 0.18}s infinite` }} />
          ))}
        </span>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {PHASES[phase]}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="skeleton" style={{ height: 13, width: '92%' }} />
        <div className="skeleton" style={{ height: 13, width: '78%' }} />
        <div className="skeleton" style={{ height: 13, width: '85%' }} />
      </div>
    </div>
  )
}
