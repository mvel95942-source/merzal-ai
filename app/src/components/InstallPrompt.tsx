import { useEffect, useState } from 'react'
import { Logo } from './Logo'

// "Download the app" popup. Uses the browser's native install prompt
// (beforeinstallprompt) on Android/Chrome/Edge; on iOS Safari (which has no such
// event) it shows the Add-to-Home-Screen hint instead. Dismissal is remembered.
const DISMISS_KEY = 'merzal_install_dismissed'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1' || isStandalone()) return

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); setShow(true) }
    const onInstalled = () => { setShow(false); localStorage.setItem(DISMISS_KEY, '1') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari: no beforeinstallprompt — offer the manual hint after a beat.
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|android/i.test(ua)
    let t = 0
    if (isIOS && isSafari) t = window.setTimeout(() => { setIosHint(true); setShow(true) }, 1200)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (t) clearTimeout(t)
    }
  }, [])

  if (!show) return null

  function dismiss() { setShow(false); localStorage.setItem(DISMISS_KEY, '1') }
  async function install() {
    if (!deferred) return
    await deferred.prompt()
    try { await deferred.userChoice } catch { /* ignore */ }
    setDeferred(null); setShow(false)
  }

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 'max(16px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 90, width: 'min(430px, calc(100vw - 24px))', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-pop)', animation: 'mz-rise .28s both' }}>
      <span style={{ flex: 'none' }}><Logo size={38} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Install Merzal AI</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.35 }}>
          {iosHint ? 'Tap the Share icon, then “Add to Home Screen”.' : 'Add it to your device for instant, full-screen access.'}
        </div>
      </div>
      {!iosHint && (
        <button onClick={install} style={{ flex: 'none', height: 36, padding: '0 16px', border: 'none', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Install</button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ flex: 'none', width: 30, height: 30, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--faint)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
    </div>
  )
}
