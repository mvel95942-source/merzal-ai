import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { aiProvider } from '../lib/ai'
import { knowledgeFor } from '../lib/knowledge'
import { SESSION_TURN_LIMIT, extractMemories, memoryContext } from '../lib/memory'
import { ACCEPT_DOCS, ACCEPT_IMAGES, readFiles } from '../lib/attachments'
import type { PendingAttachment } from '../lib/attachments'
import type { ChatMode, ConnState, Message } from '../lib/types'
import { ThinkingIndicator } from './ThinkingIndicator'
import { FeedbackModal } from './FeedbackModal'
import { ShareSheet } from './ShareSheet'
import type { ShareTarget } from './ShareSheet'
import { Markdown } from './Markdown'
import { stripThoughts } from '../lib/format'
import { isDemo, exitDemo } from '../lib/demo'
import { PREVIEW_LIMIT, previewRemaining } from '../lib/preview'

interface Props {
  chatId: string | null
  conn: ConnState
  onQueueChange: (n: number) => void
  onFirstMessage: (chatId: string, title: string) => void
}

const QKEY = 'merzal_offline_queue_v1'
type Queued = { chatId: string; text: string; mode: ChatMode }

function readQueue(): Queued[] { try { return JSON.parse(localStorage.getItem(QKEY) || '[]') } catch { return [] } }
function writeQueue(q: Queued[]) { localStorage.setItem(QKEY, JSON.stringify(q)) }

export function ChatView({ chatId, conn, onQueueChange, onFirstMessage }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<ChatMode>('campus')
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [draft, setDraft] = useState('') // streamed-but-not-saved assistant text
  const [feedbackFor, setFeedbackFor] = useState<{ m: Message; type: 'up' | 'down' } | null>(null)
  const [shareItem, setShareItem] = useState<ShareTarget | null>(null)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [previewLeft, setPreviewLeft] = useState(() => (isDemo() ? previewRemaining() : PREVIEW_LIMIT))
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!isDemo()) return
    const on = (e: Event) => setPreviewLeft((e as CustomEvent).detail as number)
    window.addEventListener('merzal-preview', on)
    return () => window.removeEventListener('merzal-preview', on)
  }, [])

  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    api.listMessages(chatId).then(setMessages)
  }, [chatId])

  // Scroll only when a turn starts (user message / thinking) or the final
  // answer lands — NOT on every streamed token. Lets the reader follow the
  // answer undisturbed while it generates.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  // Flush offline queue when back online.
  useEffect(() => {
    if (conn === 'offline') return
    const q = readQueue()
    if (!q.length) return
    ;(async () => {
      for (const item of q) {
        if (item.chatId === chatId) await runSend(item.text, item.mode, true)
      }
      const remaining = readQueue().filter((i) => i.chatId !== chatId)
      writeQueue(remaining)
      onQueueChange(remaining.length)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn])

  async function runSend(text: string, m: ChatMode, fromQueue = false, atts: PendingAttachment[] = []) {
    if (!chatId) return
    const ready = atts.filter((a) => a.status === 'ready')
    const marker = atts.length ? atts.map((a) => `📎 ${a.name}`).join('   ') + '\n' : ''
    const userMsg = await api.addMessage({ chat_id: chatId, role: 'user', content: marker + text, mode: m })
    const history = [...messages, userMsg]
    setMessages(history)
    if (messages.length === 0 && !fromQueue) onFirstMessage(chatId, (text || atts[0]?.name || 'New chat').slice(0, 48))
    extractMemories(text).catch(() => {})
    await generate(history, m, ready)
  }

  // Stream an assistant reply grounded in memory + retrieved knowledge, then
  // persist it. `history` is the full turn list ending with the user message.
  async function generate(history: Message[], m: ChatMode, atts: PendingAttachment[] = []) {
    if (!chatId) return
    setThinking(true)
    setDraft('')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let started = false
    // Coalesce token bursts into one render per animation frame. The model can
    // emit dozens of tokens per second; without this each one triggers a full
    // WordReveal re-render and the UI feels slower than the stream actually is.
    let pending = ''
    let scheduled = false
    const flush = () => { scheduled = false; if (pending) { const buf = pending; pending = ''; setDraft((d) => d + buf) } }
    try {
      const lastUser = [...history].reverse().find((x) => x.role === 'user')?.content ?? ''
      const [mem, know] = await Promise.all([memoryContext(), knowledgeFor(m).retrieve(lastUser, m)])
      const context = [mem, know].filter(Boolean).join('\n\n')
      const full = await aiProvider.streamResponse(
        {
          mode: m,
          context,
          attachments: atts.map((a) => ({ kind: a.kind, name: a.name, mime: a.mime, dataUrl: a.dataUrl, text: a.text })),
          messages: history.slice(-SESSION_TURN_LIMIT).map((x) => ({ role: x.role, content: x.content })),
          signal: ctrl.signal,
        },
        (tok) => {
          if (!started) { started = true; setThinking(false); setStreaming(true) }
          pending += tok
          if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
        },
      )
      flush() // drain anything queued for the next frame
      const saved = await api.addMessage({ chat_id: chatId, role: 'assistant', content: full, mode: m })
      setMessages((prev) => [...prev, saved])
      await api.touchChat(chatId)
    } catch {
      // aborted or endpoint error — drop the partial draft
    } finally {
      setThinking(false)
      setStreaming(false)
      setDraft('')
      abortRef.current = null
    }
  }

  // ChatGPT-style edit: replace the user message, drop everything after it
  // (including the old AI reply), and regenerate from the edited state.
  async function regenerate(userMsg: Message, newText: string) {
    if (!chatId || streaming || thinking) return
    const idx = messages.findIndex((x) => x.id === userMsg.id)
    if (idx === -1) return
    const after = messages.slice(idx + 1)
    const edited = { ...userMsg, content: newText }
    const history = [...messages.slice(0, idx), edited]
    setMessages(history)
    await api.editMessage(userMsg.id, newText)
    for (const x of after) api.deleteMessage(x.id).catch(() => {})
    extractMemories(newText).catch(() => {})
    await generate(history, userMsg.mode ?? mode)
  }

  function send() {
    const text = input.trim()
    if ((!text && !attachments.length) || !chatId || streaming || thinking) return
    if (isDemo() && previewLeft <= 0) return // free preview used up
    const atts = attachments
    setInput('')
    setAttachments([])
    if (conn === 'offline') {
      const q = [...readQueue(), { chatId, text, mode }]
      writeQueue(q)
      onQueueChange(q.length)
      // Optimistically show the queued user message.
      setMessages((prev) => [...prev, { id: 'q' + Date.now(), chat_id: chatId, role: 'user', content: text, mode, created_at: new Date().toISOString() }])
      return
    }
    runSend(text, mode, false, atts)
  }

  async function addFiles(files: FileList | File[]) {
    const read = await readFiles(files)
    setAttachments((prev) => [...prev, ...read])
  }

  function stop() {
    abortRef.current?.abort()
  }

  const empty = messages.length === 0 && !thinking && !streaming

  return (
    <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper-panel)', height: '100%' }}>
      <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 0 8px', display: empty ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center' }}>
        {empty ? (
          <Hero />
        ) : (
          <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                busy={streaming || thinking}
                onReact={(r) => reactTo(m, r)}
                onFeedback={(type) => setFeedbackFor({ m, type })}
                onShare={() => setShareItem({ title: 'Shared from Merzal AI', text: m.content })}
                onEditSubmit={(text) => regenerate(m, text)}
              />
            ))}
            {thinking && <AssistantWrap><ThinkingIndicator /></AssistantWrap>}
            {streaming && <AssistantWrap><WordReveal text={draft} /></AssistantWrap>}
          </div>
        )}
      </div>
      {isDemo() && <PreviewBanner left={previewLeft} />}
      <Composer mode={mode} setMode={setMode} input={input} setInput={setInput} onSend={send} streaming={streaming || thinking} onStop={stop} conn={conn} attachments={attachments} onFiles={addFiles} onRemoveAttachment={(id) => setAttachments((p) => p.filter((a) => a.id !== id))} blocked={isDemo() && previewLeft <= 0} />
      {feedbackFor && (
        <FeedbackModal
          type={feedbackFor.type}
          onClose={() => setFeedbackFor(null)}
          onSubmit={async (comment) => {
            const { m, type } = feedbackFor
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: type } : x)))
            await api.reactMessage(m.id, type)
            const idx = messages.findIndex((x) => x.id === m.id)
            const studentMessage = messages.slice(0, idx).reverse().find((x) => x.role === 'user')?.content
            await api.submitFeedback({
              chat_id: chatId ?? undefined,
              message_id: m.id,
              type: type === 'up' ? 'helpful' : 'not_helpful',
              comment,
              student_message: studentMessage,
              ai_response: m.content,
            }).catch(() => {})
            setFeedbackFor(null)
          }}
        />
      )}
      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
    </main>
  )

  async function reactTo(m: Message, r: 'up' | 'down') {
    const next = m.reaction === r ? null : r
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: next } : x)))
    await api.reactMessage(m.id, next)
  }
}

// Assistant streaming/thinking wrapper — no name, no avatar: clean convo style.
function AssistantWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="msg" style={{ animation: 'mz-fadein .3s both' }}>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

function MessageRow({ m, busy, onReact, onFeedback, onShare, onEditSubmit }: {
  m: Message
  busy: boolean
  onReact: (r: 'up' | 'down') => void
  onFeedback: (type: 'up' | 'down') => void
  onShare: () => void
  onEditSubmit: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)

  // ── User message: right-aligned ChatGPT-style bubble ─────────────
  if (m.role === 'user') {
    if (editing) {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '78%', maxWidth: '78%' }}>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() } if (e.key === 'Escape') cancelEdit() }}
              rows={Math.min(8, draft.split('\n').length + 1)}
              style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 18, padding: '12px 14px', fontSize: 15, lineHeight: 1.5, resize: 'vertical', outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 7 }}>
              <button onClick={cancelEdit} style={miniBtn(false)}>Cancel</button>
              <button onClick={commitEdit} style={miniBtn(true)}>Send</button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="msg" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '78%' }}>
          <div style={{ background: 'var(--user-bubble)', borderRadius: 22, padding: '10px 16px', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
          <div className="msg-actions" style={{ display: 'flex', gap: 2, marginTop: 6, justifyContent: 'flex-end' }}>
            <button className="act-btn" disabled={busy} onClick={() => { setDraft(m.content); setEditing(true) }}>Edit</button>
            <button className="act-btn" onClick={() => navigator.clipboard?.writeText(m.content)}>Copy</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Assistant message: full-width, no branding, action row ────────
  return (
    <div className="msg" style={{ minWidth: 0 }}>
      <Markdown text={stripThoughts(m.content)} />
      <div className="msg-actions" style={{ display: 'flex', gap: 2, marginTop: 8 }}>
        <button className={'act-btn' + (m.reaction === 'up' ? ' on' : '')} title="Good response" onClick={() => (m.reaction === 'up' ? onReact('up') : onFeedback('up'))}>👍</button>
        <button className={'act-btn' + (m.reaction === 'down' ? ' on' : '')} title="Bad response" onClick={() => (m.reaction === 'down' ? onReact('down') : onFeedback('down'))}>👎</button>
        <button className="act-btn" onClick={() => navigator.clipboard?.writeText(m.content)}>Copy</button>
        <button className="act-btn" onClick={onShare}>Share</button>
      </div>
    </div>
  )

  function commitEdit() {
    const t = draft.trim()
    setEditing(false)
    if (t && t !== m.content) onEditSubmit(t)
  }
  function cancelEdit() { setEditing(false); setDraft(m.content) }
}

function miniBtn(primary: boolean): React.CSSProperties {
  return { height: 32, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, border: primary ? 'none' : '1px solid var(--line-strong)', background: primary ? 'var(--ink)' : 'var(--surface)', color: primary ? 'var(--paper)' : 'var(--ink)' }
}

// Word-by-word blur-to-sharp reveal of the streamed text.
// Live-rendered streaming: Markdown + LaTeX render AS the text arrives, so bold,
// lists, and $…$ / $$…$$ math become structured immediately rather than after
// the whole answer finishes. Incomplete math stays literal until its closing
// delimiter streams in, then snaps into rendered form.
function WordReveal({ text }: { text: string }) {
  return (
    <div className="mz-streaming">
      <Markdown text={stripThoughts(text)} />
      <span className="mz-cursor" />
    </div>
  )
}

// Free-preview credit strip. Shows remaining; when used up, a sign-in CTA.
function PreviewBanner({ left }: { left: number }) {
  function signIn() { exitDemo(); window.location.href = window.location.pathname }
  if (left <= 0) {
    return (
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--surface-soft)', color: 'var(--ink)', borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 160 }}>You've used all {PREVIEW_LIMIT} free preview messages for today — they reset tomorrow. Sign in for unlimited.</span>
          <button onClick={signIn} style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign in to continue →</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '6px 16px 0', display: 'flex', justifyContent: 'center' }}>
      <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>
        Preview · {left} of {PREVIEW_LIMIT} free messages left today · <button onClick={signIn} style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', padding: 0 }}>sign in</button> for unlimited
      </span>
    </div>
  )
}

function Composer(p: {
  mode: ChatMode; setMode: (m: ChatMode) => void; input: string; setInput: (s: string) => void
  onSend: () => void; streaming: boolean; onStop: () => void; conn: ConnState
  attachments: PendingAttachment[]; onFiles: (f: FileList | File[]) => void; onRemoveAttachment: (id: string) => void
  blocked?: boolean
}) {
  const docRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const pick = (r: React.RefObject<HTMLInputElement | null>) => { r.current?.click(); setMenuOpen(false) }
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.length) p.onFiles(e.target.files); e.target.value = '' }

  // Auto-grow the textarea up to ~7 lines (168px from CSS), then scroll.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 168)
    ta.style.height = next + 'px'
    ta.style.overflowY = ta.scrollHeight > 168 ? 'auto' : 'hidden'
  }, [p.input])

  const canSend = !p.blocked && (p.input.trim().length > 0 || p.attachments.length > 0)

  return (
    <div style={{ background: 'var(--paper-panel)', padding: '6px 0 10px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 12px' }}>
        {p.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 4px 8px' }}>
            {p.attachments.map((a) => (
              <div key={a.id} title={a.note ?? a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line-strong)', borderRadius: 12, padding: '6px 10px', background: a.status === 'unsupported' ? 'var(--accent-soft)' : 'var(--surface)', maxWidth: 220 }}>
                {a.kind === 'image' && a.dataUrl
                  ? <img src={a.dataUrl} alt={a.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18 }}>{a.status === 'unsupported' ? '⚠️' : '📄'}</span>}
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <button onClick={() => p.onRemoveAttachment(a.id)} style={{ border: 'none', background: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <input ref={docRef} type="file" multiple accept={ACCEPT_DOCS} onChange={onInput} style={{ display: 'none' }} />
        <input ref={imgRef} type="file" multiple accept={ACCEPT_IMAGES} onChange={onInput} style={{ display: 'none' }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onInput} style={{ display: 'none' }} />

        {/* ChatGPT-style smooth pill: rounded composer with textarea on top,
            a thin action row below. No hard borders. */}
        <div style={{ background: 'var(--composer-bg)', borderRadius: 28, padding: '10px 8px 6px 16px', boxShadow: 'none' }}>
          <textarea
            ref={taRef}
            className="mz-composer-input"
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSend() } }}
            placeholder={p.blocked ? 'Sign in to keep chatting…' : p.conn === 'offline' ? brand.inputPlaceholderOffline : brand.inputPlaceholder}
            rows={1}
            disabled={p.blocked}
            style={{ opacity: p.blocked ? 0.55 : 1, paddingTop: 4, paddingBottom: 6 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ position: 'relative', flex: 'none' }}>
              <button title="Add" aria-label="Add" onClick={() => setMenuOpen((v) => !v)} className="mz-icon-btn" style={{ transform: menuOpen ? 'rotate(45deg)' : 'none', transition: 'transform .15s', fontSize: 22 }}>＋</button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                  <div style={{ position: 'absolute', bottom: 46, left: 0, zIndex: 31, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-pop)', padding: 6, width: 210 }}>
                    <AddItem icon="🖼️" label="Upload photo" onClick={() => pick(imgRef)} />
                    <AddItem icon="📄" label="Upload file" onClick={() => pick(docRef)} />
                    <AddItem icon="📷" label="Take photo" onClick={() => pick(camRef)} />
                  </div>
                </>
              )}
            </div>
            <ModePill mode={p.mode} setMode={p.setMode} />
            <div style={{ flex: 1 }} />
            {p.streaming ? (
              <button onClick={p.onStop} aria-label="Stop" className="mz-send-btn" title="Stop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              </button>
            ) : (
              <button onClick={p.onSend} disabled={!canSend} aria-label="Send" className="mz-send-btn" title="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
              </button>
            )}
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', margin: '6px 0 0' }}>{brand.disclaimer}</p>
      </div>
    </div>
  )
}

function AddItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', height: 40, border: 'none', borderRadius: 10, background: 'transparent', display: 'flex', alignItems: 'center', gap: 11, padding: '0 11px', fontSize: 13.5, color: 'var(--ink-soft)', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ fontSize: 17 }}>{icon}</span>{label}
    </button>
  )
}

// Selector living inside the composer: tap to switch Campus/World.
function ModePill({ mode, setMode }: { mode: ChatMode; setMode: (m: ChatMode) => void }) {
  const [open, setOpen] = useState(false)
  const META = {
    campus: { icon: '🎓', label: 'Campus', desc: 'Knows your campus' },
    world: { icon: '🌐', label: 'World', desc: 'General knowledge' },
  } as const
  const cur = META[mode]
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
        <span style={{ fontSize: 14 }}>{cur.icon}</span>{cur.label}
        <span style={{ fontSize: 9, opacity: .5 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{ position: 'absolute', bottom: 40, left: 0, zIndex: 31, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-pop)', padding: 6, width: 232 }}>
            {(['campus', 'world'] as ChatMode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setOpen(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 10, background: mode === m ? 'var(--surface-soft)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: 19 }}>{META[m].icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{META[m].label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{META[m].desc}</span>
                </span>
                {mode === m && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Clean ChatGPT-style empty state: just the question, no suggestion cards.
function Hero() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '0 24px', textAlign: 'center' }}>
      <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: '-.01em', margin: 0, color: 'var(--ink)' }}>{brand.emptyTitle}</h1>
    </div>
  )
}
