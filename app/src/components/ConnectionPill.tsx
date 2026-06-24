import type { ConnState } from '../lib/types'

const MAP: Record<ConnState, { label: string; dot: string; bg: string; fg: string }> = {
  live: { label: 'Live', dot: '#4a9d6a', bg: '#eef3ec', fg: '#3c6b4e' },
  slow: { label: 'Slow', dot: '#c79028', bg: '#f6efe0', fg: '#8a6a1c' },
  offline: { label: 'Offline', dot: '#c0563a', bg: '#fbf1ec', fg: '#a8472f' },
}

export function ConnectionPill({ state, queued = 0 }: { state: ConnState; queued?: number }) {
  const m = MAP[state]
  return (
    <span
      className="mono"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 11px', borderRadius: 999, background: m.bg, color: m.fg, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' }}
      title={state === 'offline' ? `Messages queue locally${queued ? ` (${queued})` : ''} and send on reconnect` : ''}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.dot }} />
      {m.label}{queued > 0 && state === 'offline' ? ` · ${queued} queued` : ''}
    </span>
  )
}
