import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import { hasSupabase } from './lib/supabase'
import { brand } from './lib/brand'
import type { Chat, Profile } from './lib/types'
import { Login } from './components/Login'
import { Setup } from './components/Setup'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Settings } from './components/Settings'
import { SharedView } from './components/SharedView'
import { ShareSheet } from './components/ShareSheet'
import type { ShareTarget } from './components/ShareSheet'
import { exportPdf, exportText } from './lib/export'
import { ConnectionPill } from './components/ConnectionPill'
import { useConnection } from './hooks/useConnection'
import { useIsMobile } from './hooks/useIsMobile'

type Phase = 'loading' | 'login' | 'setup' | 'app'

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
  const conn = useConnection()
  const isMobile = useIsMobile()

  // Public read-only share route: #/share/<token> — no auth required.
  const shareToken = typeof window !== 'undefined' && window.location.hash.startsWith('#/share/')
    ? window.location.hash.slice('#/share/'.length)
    : null

  const loadAfterAuth = useCallback(async () => {
    const session = await api.getSession()
    if (!session) { setPhase('login'); return }
    setAccount(session.user.email ?? session.user.phone ?? 'You')
    const prof = await api.getProfile()
    setProfile(prof)
    if (!prof || !prof.onboarding_done) { setPhase('setup'); return }
    const list = await api.listChats()
    setChats(list)
    setActiveId(list[0]?.id ?? null)
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

  if (phase === 'loading') {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--faint)' }} className="mono">Loading {brand.name}…</div>
  }
  if (phase === 'login') return <Login />
  if (phase === 'setup') return <Setup onDone={loadAfterAuth} />

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
          {drawerOpen && <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: '#1d1a1655', zIndex: 40 }} />}
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(82vw, 320px)', zIndex: 41, transform: drawerOpen ? 'translateX(0)' : 'translateX(-104%)', transition: 'transform .24s ease', boxShadow: drawerOpen ? '4px 0 24px #0002' : 'none' }}>
            {sidebar}
          </div>
        </>
      ) : <div style={{ width: 264, flex: 'none' }}>{sidebar}</div>}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 54, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--line)', background: '#f6f3ecdd', backdropFilter: 'blur(6px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setDrawerOpen(true)} aria-label="Menu" style={{ width: 36, height: 36, flex: 'none', border: '1px solid var(--line-strong)', borderRadius: 9, background: '#fff', fontSize: 16, display: 'grid', placeItems: 'center' }}>☰</button>
            )}
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.department ?? 'Campus'}{profile?.semester ? ` · Sem ${profile.semester}` : ''}
            </span>
          </div>
          <ConnectionPill state={conn} queued={queued} />
        </header>

        <ChatViewGate activeId={activeId} ensureActive={ensureActive} conn={conn} setQueued={setQueued} onFirstMessage={onFirstMessage} />
      </div>

      {showSettings && (
        <Settings
          profile={profile}
          onClose={() => setShowSettings(false)}
          onSignOut={async () => { await api.signOut(); setShowSettings(false); setPhase('login') }}
          onProfile={(p) => setProfile((prev) => (prev ? { ...prev, ...p } : prev))}
        />
      )}

      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
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
