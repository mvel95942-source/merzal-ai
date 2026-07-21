import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { SharedConversation } from '../lib/api'
import { Markdown } from './Markdown'
import { stripThoughts } from '../lib/format'
import { Logo } from './Logo'

// Public, read-only conversation viewer reached via #/share/<token>.
export function SharedView({ token }: { token: string }) {
  const [data, setData] = useState<SharedConversation | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.getSharedChat(token).then(setData).catch(() => setData(null)) }, [token])

  // Copy the conversation into the viewer's own account and continue it.
  async function continueChat() {
    setBusy(true)
    try {
      const session = await api.getSession()
      if (session) {
        const id = await api.importSharedChat(token)
        if (id) localStorage.setItem('merzal_open_chat', id)
      } else {
        localStorage.setItem('merzal_continue_token', token) // import right after login
      }
    } catch { /* ignore */ }
    window.location.href = window.location.pathname // back to the app (or login)
  }

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
                    <div style={{ maxWidth: '80%', background: 'var(--user-bubble)', color: 'var(--ink)', border: '1px solid var(--line-strong)', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id}><Markdown text={stripThoughts(m.content)} /></div>
                ),
              )}
            </div>
            <div style={{ marginTop: 32, padding: '18px 0 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <button onClick={continueChat} disabled={busy} style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? 'Opening…' : 'Continue this chat in your account →'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--faint)', margin: 0 }}>This copies the conversation into your account so you can keep chatting. Shared from Merzal AI.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
