import { useCallback, useEffect, useState } from 'react'
import { api, emailToRoll } from './lib/api'
import { hasSupabase } from './lib/supabase'
import { brand } from './lib/brand'
import type { Chat, Profile } from './lib/types'
import { Login } from './components/Login'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Settings } from './components/Settings'
import { SharedView } from './components/SharedView'
import { AdminImport } from './components/AdminImport'
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
  const [shareItem, setShareItem] = useState<ShareTarget | null>(null)
  const [hash, setHash] = useState(typeof window !== 'undefined' ? window.location.hash : '')
  const conn = useConnection()
  const isMobile = useIsMobile()

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Public read-only share route: #/share/<token> — no auth required.
  const shareToken = hash.startsWith('#/share/') ? hash.slice('#/share/'.length) : null
  const adminRoute = hash === '#/admin'

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

  async function newChat() {
    const c = await api.createChat()
    setChats((prev) => [c, ...prev])
    setActiveId(c.id)
  }

  async function ensureActive() {
    const c = await api.createChat()
    setChats((prev) => [c, ...prev])
    setActiveId(c.id)
    return c.id
  }

  async function onFirstMessage(chatId: string, title: string) {
    await api.renameChat(chatId, title)
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)))
  }

  if (shareToken) return <SharedView token={shareToken} />
  if (adminRoute && phase === 'app' && profile?.role === 'admin') return <AdminImport onClose={() => { window.location.hash = '' }} />

  if (phase === 'loading') {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--faint)', background: 'var(--paper)' }}>Loading {brand.name}…</div>
  }
  if (phase === 'login') return <Login />

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
      ) : <div style={{ width: 264, flex: 'none' }}>{sidebar}</div>}

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper-panel)' }}>
        <header style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 8px', background: 'var(--paper-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="mz-icon-btn" style={{ width: 40, height: 40 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h16" /><path d="M4 16h12" /></svg>
              </button>
            )}
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
      {conn === 'offline' && <OfflineToast queued={queued} />}
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
