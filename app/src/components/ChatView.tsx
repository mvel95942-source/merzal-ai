import { useEffect, useRef, useState } from 'react'
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
import { Logo } from './Logo'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    api.listMessages(chatId).then(setMessages)
  }, [chatId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, draft, thinking])

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
          setDraft((d) => d + tok)
        },
      )
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
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper-panel)', height: '100%' }}>
      <div ref={scrollRef} className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 0', display: empty ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center' }}>
        {empty ? (
          <Hero onPick={(q) => { setInput(q); setTimeout(send, 0) }} disabled={!chatId} />
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
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
      <Composer mode={mode} setMode={setMode} input={input} setInput={setInput} onSend={send} streaming={streaming || thinking} onStop={stop} conn={conn} attachments={attachments} onFiles={addFiles} onRemoveAttachment={(id) => setAttachments((p) => p.filter((a) => a.id !== id))} />
      {feedbackFor && (
        <FeedbackModal
          type={feedbackFor.type}
          onClose={() => setFeedbackFor(null)}
          onSubmit={async (comment) => {
            const { m, type } = feedbackFor
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: type } : x)))
            await api.reactMessage(m.id, type)
            if (chatId) await api.submitFeedback({ chat_id: chatId, message_id: m.id, type, comment }).catch(() => {})
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

  // ── User message: right-aligned bubble, Edit + Copy ──────────────
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
              style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 14, padding: '11px 14px', fontSize: 14.5, lineHeight: 1.5, resize: 'vertical', outline: 'none', background: '#fff', color: 'var(--ink)' }}
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
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
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
      <div style={{ fontSize: 14.5, lineHeight: 1.62, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
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
  return { height: 30, padding: '0 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, border: primary ? 'none' : '1px solid var(--line-strong)', background: primary ? 'var(--accent)' : '#fff', color: primary ? '#fff' : 'var(--ink)' }
}

// Word-by-word blur-to-sharp reveal of the streamed text.
function WordReveal({ text }: { text: string }) {
  const words = text.split(/(\s+)/)
  return (
    <div style={{ fontSize: 14.5, lineHeight: 1.62, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>
      {words.map((w, i) => (w.trim() ? <span key={i} className="mz-word">{w}</span> : w))}
      <span style={{ display: 'inline-block', width: 7, height: 15, background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'mz-pulse .8s infinite' }} />
    </div>
  )
}

function Composer(p: {
  mode: ChatMode; setMode: (m: ChatMode) => void; input: string; setInput: (s: string) => void
  onSend: () => void; streaming: boolean; onStop: () => void; conn: ConnState
  attachments: PendingAttachment[]; onFiles: (f: FileList | File[]) => void; onRemoveAttachment: (id: string) => void
}) {
  const docRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const pick = (r: React.RefObject<HTMLInputElement | null>) => r.current?.click()
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.length) p.onFiles(e.target.files); e.target.value = '' }

  return (
    <div style={{ borderTop: '1px solid var(--line)', background: 'var(--paper-panel)', padding: '12px 0 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        <ModeToggle mode={p.mode} setMode={p.setMode} />

        {p.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 10px' }}>
            {p.attachments.map((a) => (
              <div key={a.id} title={a.note ?? a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--line-strong)', borderRadius: 10, padding: '6px 8px', background: a.status === 'unsupported' ? '#fbeee6' : '#fff', maxWidth: 220 }}>
                {a.kind === 'image' && a.dataUrl
                  ? <img src={a.dataUrl} alt={a.name} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18 }}>{a.status === 'unsupported' ? '⚠️' : '📄'}</span>}
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <button onClick={() => p.onRemoveAttachment(a.id)} style={{ border: 'none', background: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, border: '1px solid var(--line-strong)', borderRadius: 16, background: '#fff', padding: '6px 6px 6px 8px' }}>
          <input ref={docRef} type="file" multiple accept={ACCEPT_DOCS} onChange={onInput} style={{ display: 'none' }} />
          <input ref={imgRef} type="file" multiple accept={ACCEPT_IMAGES} onChange={onInput} style={{ display: 'none' }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onInput} style={{ display: 'none' }} />
          <button title="Attach file" onClick={() => pick(docRef)} style={iconBtn}>📎</button>
          <button title="Upload image" onClick={() => pick(imgRef)} style={iconBtn}>🖼️</button>
          <button title="Camera" onClick={() => pick(camRef)} style={iconBtn}>📷</button>
          <textarea
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSend() } }}
            placeholder={p.conn === 'offline' ? brand.inputPlaceholderOffline : brand.inputPlaceholder}
            rows={1}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none', fontSize: 16, lineHeight: 1.5, maxHeight: 160, background: 'transparent', color: 'var(--ink)', padding: '7px 2px' }}
          />
          {p.streaming ? (
            <button onClick={p.onStop} style={btn('#1d1a16')}>■</button>
          ) : (
            <button onClick={p.onSend} style={btn('var(--accent)')}>↑</button>
          )}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', margin: '8px 0 0' }}>{brand.disclaimer}</p>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = { width: 36, height: 36, flex: 'none', border: 'none', background: 'transparent', borderRadius: 9, fontSize: 17, cursor: 'pointer', display: 'grid', placeItems: 'center' }

function ModeToggle({ mode, setMode }: { mode: ChatMode; setMode: (m: ChatMode) => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: '#ece7dd', borderRadius: 9, marginBottom: 10 }}>
      {(['campus', 'world'] as ChatMode[]).map((m) => (
        <button key={m} onClick={() => setMode(m)} className="mono" style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 7, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', background: mode === m ? '#fff' : 'transparent', color: mode === m ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>
          {m === 'campus' ? 'Campus' : 'World'}
        </button>
      ))}
    </div>
  )
}

function Hero({ onPick, disabled }: { onPick: (q: string) => void; disabled?: boolean }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={52} /></div>
      <h1 className="display" style={{ fontWeight: 400, fontSize: 38, letterSpacing: '-.02em', margin: '20px 0 10px' }}>How can I help on campus?</h1>
      <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.5 }}>{brand.emptyDesc}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {brand.prompts.map((q) => (
          <button key={q} disabled={disabled} onClick={() => onPick(q)} style={{ textAlign: 'left', border: '1px solid var(--line-strong)', borderRadius: 12, background: '#fff', padding: '13px 15px', fontSize: 13.5, color: 'var(--ink-soft)', opacity: disabled ? 0.5 : 1 }}>{q}</button>
        ))}
      </div>
    </div>
  )
}

const btn = (bg: string): React.CSSProperties => ({ width: 38, height: 38, flex: 'none', border: 'none', borderRadius: 11, background: bg, color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' })
