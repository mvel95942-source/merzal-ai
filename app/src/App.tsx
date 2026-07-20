import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, emailToRoll } from './lib/api'
import { hasSupabase } from './lib/supabase'
import { brand } from './lib/brand'
import type { Chat, Profile } from './lib/types'
import { isAdmin, isSuperAdmin } from './lib/types'
import { Login } from './components/Login'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Settings } from './components/Settings'
import { SharedView } from './components/SharedView'
import { InstallPrompt } from './components/InstallPrompt'
// Admin-only surfaces are code-split so students never download xlsx/charts.
const AdminPanel = lazy(() => import('./components/admin/AdminPanel').then((m) => ({ default: m.AdminPanel })))
const FeedbackInbox = lazy(() => import('./components/FeedbackInbox').then((m) => ({ default: m.FeedbackInbox })))
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard })))
import { ForcePasswordChange } from './components/ForcePasswordChange'
import { ShareSheet } from './components/ShareSheet'
import type { ShareTarget } from './components/ShareSheet'
import { exportPdf, exportText } from './lib/export'
import { useConnection } from './hooks/useConnection'
import { useIsMobile } from './hooks/useIsMobile'

type Phase = 'loading' | 'login' | 'app'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [account, setAccount] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [queued, setQueued] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(true) // desktop sidebar collapse (mobile-first: hideable)
  const [shareItem, setShareItem] = useState<ShareTarget | null>(null)
  const [newChatHint, setNewChatHint] = useState(false)
  const [hash, setHash] = useState(typeof window !== 'undefined' ? window.location.hash : '')
  const conn = useConnection()
  const isMobile = useIsMobile()

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Auto-dismiss the "start a conversation first" nudge.
  useEffect(() => {
    if (!newChatHint) return
    const t = setTimeout(() => setNewChatHint(false), 2800)
    return () => clearTimeout(t)
  }, [newChatHint])

  // Public read-only share route: #/share/<token> — no auth required.
  const shareToken = hash.startsWith('#/share/') ? hash.slice('#/share/'.length) : null
  const adminRoute = hash === '#/admin' || hash.startsWith('#/admin/')
  const feedbackRoute = hash === '#/feedback'
  const analyticsRoute = hash === '#/analytics'

  const loadAfterAuth = useCallback(async () => {
    const session = await api.getSession()
    if (!session) { setPhase('login'); return }
    setAccount(emailToRoll(session.user.email) ?? 'You')
    const prof = await api.getProfile()
    if (prof && !prof.onboarding_done) {
      await api.upsertProfile({ onboarding_done: true })
      setProfile({ ...prof, onboarding_done: true })
    } else {
      setProfile(prof)
    }
    // Continue a conversation opened from a share link.
    let openId = localStorage.getItem('merzal_open_chat')
    const contTok = localStorage.getItem('merzal_continue_token')
    if (contTok) {
      try { const id = await api.importSharedChat(contTok); if (id) openId = id } catch { /* ignore */ }
      localStorage.removeItem('merzal_continue_token')
    }
    localStorage.removeItem('merzal_open_chat')
    const list = await api.listChats()
    setChats(list)
    setActiveId(openId ?? list[0]?.id ?? null)
    setPhase('app')
  }, [])

  useEffect(() => {
    if (!hasSupabase) { setPhase('login'); return }
    loadAfterAuth()
    const { data } = api.onAuthChange(() => loadAfterAuth())
    return () => data.subscription.unsubscribe()
  }, [loadAfterAuth])

  // Enforce one conversation per chat: never spawn a second empty chat while one
  // already exists. If the user clicks "New chat" with an untouched chat around,
  // we just surface that chat (and nudge them) instead of piling up blank rows.
  async function newChat() {
    const empty = chats.find((c) => (c.msgCount ?? 0) === 0)
    if (empty) {
      setActiveId(empty.id)
      if (empty.id === activeId) setNewChatHint(true) // already here → they need a reason why nothing changed
      return
    }
    const c = await api.createChat()
    setChats((prev) => [c, ...prev])
    setActiveId(c.id)
  }

  // Lazily reuse/create the active chat. Reuses an existing empty chat so we
  // don't strand the user on a blank chat while another empty one lingers.
  async function ensureActive() {
    const empty = chats.find((c) => (c.msgCount ?? 0) === 0)
    if (empty) { setActiveId(empty.id); return empty.id }
    const c = await api.createChat()
    setChats((prev) => [c, ...prev])
    setActiveId(c.id)
    return c.id
  }

  async function onFirstMessage(chatId: string, title: string) {
    await api.renameChat(chatId, title)
    // First message lands → chat is no longer empty, so "New chat" is unlocked.
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title, msgCount: (c.msgCount ?? 0) + 1 } : c)))
  }

  if (shareToken) return <SharedView token={shareToken} />
  // #/admin is open to any admin (Super or Department); feedback + analytics
  // are Super Admin only — both here and server-side via RLS. Lazy surfaces are
  // wrapped in Suspense so their chunk loads on demand.
  const routeFallback = <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--faint)', background: 'var(--paper-app)' }}>Loading…</div>
  // Admin reset a password → force a new one before anything else renders.
  if (phase === 'app' && profile?.must_change_password) {
    return <ForcePasswordChange onDone={() => { setProfile((p) => (p ? { ...p, must_change_password: false } : p)) }} />
  }
  if (adminRoute && phase === 'app' && isAdmin(profile)) return <Suspense fallback={routeFallback}><AdminPanel profile={profile} onClose={() => { window.location.hash = '' }} /></Suspense>
  if (feedbackRoute && phase === 'app' && isSuperAdmin(profile)) return <Suspense fallback={routeFallback}><FeedbackInbox onClose={() => { window.location.hash = '' }} /></Suspense>
  if (analyticsRoute && phase === 'app' && isSuperAdmin(profile)) return <Suspense fallback={routeFallback}><AnalyticsDashboard onClose={() => { window.location.hash = '' }} /></Suspense>

  if (phase === 'loading') {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--faint)', background: 'var(--paper)' }}>Loading {brand.name}…</div>
  }
  if (phase === 'login') return <><Login /><InstallPrompt /></>

  const closeDrawer = () => setDrawerOpen(false)

  async function shareConversation(id: string) {
    closeDrawer()
    try {
      const token = await api.shareChat(id)
      const url = `${window.location.origin}${window.location.pathname}#/share/${token}`
      const title = chats.find((c) => c.id === id)?.title ?? 'Shared conversation'
      setShareItem({ title, url })
    } catch {
      setShareItem({ title: 'Share', text: 'Could not create a share link. Sign in with Supabase to share conversations.' })
    }
  }

  async function exportConversation(id: string, fmt: 'pdf' | 'txt') {
    closeDrawer()
    const msgs = await api.listMessages(id)
    const title = chats.find((c) => c.id === id)?.title ?? 'Conversation'
    if (fmt === 'txt') exportText(title, msgs)
    else exportPdf(title, msgs)
  }

  const sidebar = (
    <Sidebar
      chats={chats}
      activeId={activeId}
      account={account}
      onSelect={(id) => { setActiveId(id); closeDrawer() }}
      onNew={() => { newChat(); closeDrawer() }}
      onRename={(id, t) => { api.renameChat(id, t); setChats((p) => p.map((c) => (c.id === id ? { ...c, title: t } : c))) }}
      onPin={(id, pinned) => { api.pinChat(id, pinned); setChats((p) => p.map((c) => (c.id === id ? { ...c, pinned } : c))) }}
      onDelete={(id) => { api.deleteChat(id); setChats((p) => p.filter((c) => c.id !== id)); if (activeId === id) setActiveId(null) }}
      onShare={shareConversation}
      onExport={exportConversation}
      onSettings={() => { setShowSettings(true); closeDrawer() }}
    />
  )

  return (
    <div style={{ height: '100dvh', display: 'flex', overflow: 'hidden', background: 'var(--paper-app)' }}>
      {/* Sidebar: fixed column on desktop, slide-in drawer on mobile */}
      {isMobile ? (
        <>
          {drawerOpen && <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 40 }} />}
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(82vw, 320px)', zIndex: 41, transform: drawerOpen ? 'translateX(0)' : 'translateX(-104%)', transition: 'transform .24s ease', boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.18)' : 'none' }}>
            {sidebar}
          </div>
        </>
      ) : (
        <div style={{ width: navOpen ? 264 : 0, flex: 'none', overflow: 'hidden', transition: 'width .22s ease' }}>{sidebar}</div>
      )}

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper-panel)' }}>
        <header style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 8px', background: 'var(--paper-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <button onClick={() => (isMobile ? setDrawerOpen(true) : setNavOpen((v) => !v))} aria-label={isMobile ? 'Open menu' : navOpen ? 'Hide sidebar' : 'Show sidebar'} title={isMobile ? 'Menu' : navOpen ? 'Hide sidebar' : 'Show sidebar'} className="mz-icon-btn" style={{ width: 40, height: 40 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h16" /><path d="M4 16h12" /></svg>
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {brand.shortName ?? brand.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => { newChat(); closeDrawer() }} aria-label="New chat" title="New chat" className="mz-icon-btn" style={{ width: 40, height: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3.5a2.12 2.12 0 0 1 3 3L7 18l-4 1 1-4Z" /><path d="M14 5l4 4" /></svg>
            </button>
          </div>
        </header>

        <ChatViewGate activeId={activeId} ensureActive={ensureActive} conn={conn} setQueued={setQueued} onFirstMessage={onFirstMessage} />
      </div>

      {showSettings && (
        <Settings
          profile={profile}
          onClose={() => setShowSettings(false)}
          onSignOut={async () => { await api.signOut(); setShowSettings(false); setPhase('login') }}
        />
      )}

      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
      {newChatHint && <NewChatHint />}
      {conn === 'offline' && <OfflineToast queued={queued} />}
      <InstallPrompt />
    </div>
  )
}

// Nudge shown when the user hits "New chat" on an already-empty chat: explains
// why no new chat appeared (one conversation per chat before starting another).
function NewChatHint() {
  return (
    <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', borderRadius: 999, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', animation: 'mz-rise .3s both' }}>
      Start this chat before opening a new one
    </div>
  )
}

// Shown only when the network drops — replaces the always-on Live/Slow pill.
function OfflineToast({ queued }: { queued: number }) {
  return (
    <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', borderRadius: 999, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', animation: 'mz-rise .3s both' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger, #d9694a)' }} />
      You’re offline{queued > 0 ? ` — ${queued} message${queued > 1 ? 's' : ''} queued` : ' — messages will send when you reconnect'}
    </div>
  )
}

// Lazily creates a chat the moment the workspace needs one, so sends from the
// empty hero always have a home row to persist into.
function ChatViewGate({ activeId, ensureActive, conn, setQueued, onFirstMessage }: {
  activeId: string | null
  ensureActive: () => Promise<string>
  conn: ReturnType<typeof useConnection>
  setQueued: (n: number) => void
  onFirstMessage: (id: string, title: string) => void
}) {
  const [resolvedId, setResolvedId] = useState<string | null>(activeId)

  useEffect(() => {
    if (activeId) { setResolvedId(activeId); return }
    let cancelled = false
    ensureActive().then((id) => { if (!cancelled) setResolvedId(id) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  return <ChatView chatId={resolvedId} conn={conn} onQueueChange={setQueued} onFirstMessage={onFirstMessage} />
}
