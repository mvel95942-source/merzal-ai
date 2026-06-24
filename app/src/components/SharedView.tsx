import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { SharedConversation } from '../lib/api'
import { Logo } from './Logo'

// Public, read-only conversation viewer reached via #/share/<token>.
export function SharedView({ token }: { token: string }) {
  const [data, setData] = useState<SharedConversation | null | 'loading'>('loading')
  useEffect(() => { api.getSharedChat(token).then(setData).catch(() => setData(null)) }, [token])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Merzal AI</span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', marginLeft: 'auto' }}>Shared · read-only</span>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' }}>
        {data === 'loading' && <p className="mono" style={{ color: 'var(--faint)' }}>Loading…</p>}
        {data === null && <p style={{ color: 'var(--muted)' }}>This shared conversation isn’t available (the link may have been revoked).</p>}
        {data && data !== 'loading' && (
          <>
            <h1 className="display" style={{ fontWeight: 400, fontSize: 26, margin: '0 0 22px' }}>{data.title}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {data.messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ maxWidth: '80%', background: '#fff', border: '1px solid var(--line-strong)', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} style={{ fontSize: 14.5, lineHeight: 1.62, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                ),
              )}
            </div>
            <p style={{ marginTop: 40, fontSize: 12, color: 'var(--faint)' }}>Shared from Merzal AI — a private campus assistant.</p>
          </>
        )}
      </div>
    </div>
  )
}
