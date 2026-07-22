import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
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

  // Guards against overlapping boots. Supabase fires INITIAL_SESSION on load AND
  // we call this directly, so two runs used to race (duplicate network, chat
  // flicker). A monotonic token lets only the newest run commit its results.
  const bootSeq = useRef(0)
  // True once this TAB has completed its first boot. Later boots (auth events on
  // tab refocus) must not reset which chat is open — see loadAfterAuth.
  const bootedRef = useRef(false)
  // De-dupes concurrent chat creation: React can invoke the gate effect twice
  // (StrictMode) and two callers would each POST a new chat, which is how blank
  // "New chat" rows piled up. Callers share the in-flight promise instead.
  const creatingRef = useRef<Promise<string> | null>(null)
  // Id of the single blank chat, tracked synchronously so back-to-back "New chat"
  // clicks can't outrun the `chats` state update. Cleared on first message (gate
  // re-arms) or if that chat is deleted.
  const emptyChatRef = useRef<string | null>(null)
  const loadAfterAuth = useCallback(async () => {
    const seq = ++bootSeq.current
    const stale = () => seq !== bootSeq.current
    try {
      const session = await api.getSession()
      if (stale()) return
      if (!session) { setPhase('login'); return }
      setAccount(emailToRoll(session.user.email) ?? 'You')

      // Continue a conversation opened from a share link (before the chat list).
      let openId = localStorage.getItem('merzal_open_chat')
      const contTok = localStorage.getItem('merzal_continue_token')
      if (contTok) {
        try { const id = await api.importSharedChat(contTok); if (id) openId = id } catch { /* ignore */ }
        localStorage.removeItem('merzal_continue_token')
      }
      localStorage.removeItem('merzal_open_chat')

      // Profile and chat list are independent — fetch in parallel so the slower
      // of the two gates boot, not their sum. A failure in either must NOT hang
      // the app on the loading screen (that was the "refresh many times" bug).
      const [prof, list] = await Promise.all([
        api.getProfile().catch(() => null),
        api.listChats().catch(() => [] as Chat[]),
      ])
      if (stale()) return
      if (prof && !prof.onboarding_done) {
        api.upsertProfile({ onboarding_done: true }).catch(() => {})
        setProfile({ ...prof, onboarding_done: true })
      } else {
        setProfile(prof)
      }
      setChats(list)
      // Open a FRESH chat only on the FIRST load of this tab. Supabase re-fires
      // SIGNED_IN when the tab regains focus (session revalidation), and this
      // used to run again and yank the user out of the conversation they were in
      // — and spawn another blank chat each time. Now: switch tabs and come
      // back, you stay exactly where you were; you only land on a new chat when
      // the app/tab is closed and opened again. A share link still wins.
      if (!bootedRef.current) {
        bootedRef.current = true
        setActiveId(openId ?? null)
      } else if (openId) {
        setActiveId(openId)
      }
      setPhase('app')
    } catch {
      // Never strand the user on "Loading…": on any unexpected error, fall back
      // to the login screen so a retry is one tap away, not a full refresh.
      if (!stale()) setPhase((p) => (p === 'app' ? p : 'login'))
    }
  }, [])

  useEffect(() => {
    if (!hasSupabase) { setPhase('login'); return }
    loadAfterAuth()
    // Only reload on a real sign-in/out. INITIAL_SESSION duplicates the direct
    // call above; TOKEN_REFRESHED / USER_UPDATED fire periodically and must NOT
    // reload — doing so reset the open chat mid-session and re-ran all boot I/O.
    const { data } = api.onAuthChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') loadAfterAuth()
    })
    return () => data.subscription.unsubscribe()
  }, [loadAfterAuth])

  // Open the one blank chat, creating it only if none exists. Single funnel for
  // BOTH the "New chat" button and the lazy gate, because the old split versions
  // raced: `chats` state lags a click by a render, so hammering "New chat" (e.g.
  // while a question is sending) had every call read the same stale list, find no
  // blank chat, and mint another one — the "many new chats" bug.
  //
  // Three layers close that window:
  //   1. creatingRef  — an in-flight creation is shared, never duplicated.
  //   2. emptyChatRef — the id of the blank chat, set SYNCHRONOUSLY at creation
  //      so the very next click sees it before React re-renders.
  //   3. chats state  — the durable source once the render lands.
  async function openOrCreateEmpty(fromButton: boolean): Promise<string> {
    if (creatingRef.current) return creatingRef.current // 1
    const known = chats.find((c) => (c.msgCount ?? 0) === 0)?.id ?? emptyChatRef.current // 2 + 3
    if (known) {
      setActiveId(known)
      // Already sitting on it → say why nothing appeared to happen.
      if (fromButton && known === activeId) setNewChatHint(true)
      return known
    }
    const p = (async () => {
      const c = await api.createChat()
      emptyChatRef.current = c.id
      setChats((prev) => [c, ...prev])
      setActiveId(c.id)
      return c.id
    })()
    creatingRef.current = p
    try { return await p } finally { creatingRef.current = null }
  }

  function newChat() { void openOrCreateEmpty(true) }
  function ensureActive(): Promise<string> { return openOrCreateEmpty(false) }

  async function onFirstMessage(chatId: string, title: string) {
    // First message lands → this chat is no longer blank, so a NEW one is
    // unlocked. Clearing the ref here is what re-arms the gate.
    if (emptyChatRef.current === chatId) emptyChatRef.current = null
    await api.renameChat(chatId, title)
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
      onDelete={(id) => {
        api.deleteChat(id)
        // Don't let the gate keep pointing at a chat that no longer exists.
        if (emptyChatRef.current === id) emptyChatRef.current = null
        setChats((p) => p.filter((c) => c.id !== id))
        if (activeId === id) setActiveId(null)
      }}
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
