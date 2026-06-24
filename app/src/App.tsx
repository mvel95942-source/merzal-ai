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
import { ConnectionPill } from './components/ConnectionPill'
import { useConnection } from './hooks/useConnection'

type Phase = 'loading' | 'login' | 'setup' | 'app'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [account, setAccount] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [queued, setQueued] = useState(0)
  const conn = useConnection()

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

  if (phase === 'loading') {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--faint)' }} className="mono">Loading {brand.name}…</div>
  }
  if (phase === 'login') return <Login />
  if (phase === 'setup') return <Setup onDone={loadAfterAuth} />

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--paper-app)' }}>
      <Sidebar
        chats={chats}
        activeId={activeId}
        account={account}
        onSelect={setActiveId}
        onNew={newChat}
        onRename={(id, t) => { api.renameChat(id, t); setChats((p) => p.map((c) => (c.id === id ? { ...c, title: t } : c))) }}
        onPin={(id, pinned) => { api.pinChat(id, pinned); setChats((p) => p.map((c) => (c.id === id ? { ...c, pinned } : c))) }}
        onDelete={(id) => { api.deleteChat(id); setChats((p) => p.filter((c) => c.id !== id)); if (activeId === id) setActiveId(null) }}
        onSettings={() => setShowSettings(true)}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: '1px solid var(--line)', background: '#f6f3ecdd', backdropFilter: 'blur(6px)' }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            {profile?.department ?? 'Campus'}{profile?.semester ? ` · Sem ${profile.semester}` : ''}
          </span>
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
