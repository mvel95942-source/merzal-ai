import { useEffect, useState } from 'react'
import { Logo } from './Logo'

// "Download the app" popup. It shows shortly after the web app opens in a
// browser (unless already installed or dismissed). If the browser exposes the
// native install prompt (Android/Chrome/Edge), the Install button triggers it;
// otherwise it shows the manual "Add to Home Screen" steps (iOS / other browsers).
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
  const [show, setShow] = useState(false)
  const [hint, setHint] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1' || isStandalone()) return

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent) }
    const onInstalled = () => { setShow(false); localStorage.setItem(DISMISS_KEY, '1') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // Surface the popup shortly after the app opens, regardless of whether the
    // browser fired the native install event (it often doesn't right away).
    const t = window.setTimeout(() => setShow(true), 1000)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(t)
    }
  }, [])

  if (!show) return null

  const ua = navigator.userAgent
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const showHint = hint || (isIOS && !deferred)
  const hintText = isIOS
    ? 'Tap the Share icon, then “Add to Home Screen”.'
    : 'Open your browser menu (⋮) and choose “Install app” / “Add to Home screen”.'

  function dismiss() { setShow(false); localStorage.setItem(DISMISS_KEY, '1') }
  async function install() {
    if (deferred) {
      await deferred.prompt()
      try { await deferred.userChoice } catch { /* ignore */ }
      setDeferred(null); setShow(false)
    } else {
      setHint(true) // no native prompt available — reveal the manual steps
    }
  }

  return (
    <div style={{ position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', left: 12, right: 12, margin: '0 auto', zIndex: 90, width: 'auto', maxWidth: 440, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-pop)', animation: 'mz-drop .28s both' }}>
      <span style={{ flex: 'none' }}><Logo size={38} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Install Merzal AI</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.35 }}>
          {showHint ? hintText : 'Add it to your device for instant, full-screen access.'}
        </div>
      </div>
      {!showHint && (
        <button onClick={install} style={{ flex: 'none', height: 36, padding: '0 16px', border: 'none', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Install</button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ flex: 'none', width: 30, height: 30, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--faint)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
    </div>
  )
}
