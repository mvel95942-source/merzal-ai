import type { ReactNode } from 'react'
import { Link, Mail, MessageCircle, Send, Share as ShareIcon } from './Icons'

// Share a single message (text) or a whole conversation (url) to common apps.
export interface ShareTarget { title?: string; text?: string; url?: string }

export function ShareSheet({ item, onClose }: { item: ShareTarget; onClose: () => void }) {
  const text = item.text ?? ''
  const url = item.url ?? ''
  const payload = [text, url].filter(Boolean).join('\n')
  const enc = encodeURIComponent
  const subject = item.title ?? 'Shared from Merzal AI'

  const targets: { label: string; icon: ReactNode; run: () => void }[] = [
    { label: 'Copy', icon: <Link size={22} />, run: () => { navigator.clipboard?.writeText(url || text); onClose() } },
    { label: 'WhatsApp', icon: <MessageCircle size={22} />, run: () => open(`https://wa.me/?text=${enc(payload)}`) },
    { label: 'Telegram', icon: <Send size={22} />, run: () => open(url ? `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` : `https://t.me/share/url?url=${enc(text)}`) },
    { label: 'Email', icon: <Mail size={22} />, run: () => open(`mailto:?subject=${enc(subject)}&body=${enc(payload)}`) },
  ]
  if (typeof navigator !== 'undefined' && navigator.share) {
    targets.push({ label: 'More…', icon: <ShareIcon size={22} />, run: async () => { try { await navigator.share({ title: subject, text, url: url || undefined }) } catch { /* cancelled */ } onClose() } })
  }
  function open(href: string) { window.open(href, '_blank', 'noopener,noreferrer'); onClose() }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay, #1d1a1688)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, animation: 'mz-fadein .15s both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100vw)', background: 'var(--paper-panel, #f6f3ec)', color: 'var(--ink)', borderRadius: '18px 18px 0 0', padding: '18px 18px max(20px, env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px #0006' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line-strong, #ddd4c5)', margin: '0 auto 14px' }} />
        <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{url ? 'Share conversation' : 'Share message'}</h3>
        {url && <div style={{ fontSize: 12, color: 'var(--muted, #7a7166)', background: 'var(--surface-soft, #fff)', border: '1px solid var(--line-strong, #ddd4c5)', borderRadius: 9, padding: '8px 10px', marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 10 }}>
          {targets.map((t) => (
            <button key={t.label} onClick={t.run} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px', border: '1px solid var(--line-strong, #ddd4c5)', borderRadius: 12, background: 'var(--surface, #fff)', color: 'var(--ink)', cursor: 'pointer' }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--ink, #1d1a16)' }}>{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 14, height: 42, borderRadius: 11, border: '1px solid var(--line-strong, #ddd4c5)', background: 'var(--surface, #fff)', color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>Close</button>
      </div>
    </div>
  )
}
