import { useEffect, useRef, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { streamChat } from '../lib/llm'
import type { ChatMode, ConnState, Message } from '../lib/types'
import { ThinkingIndicator } from './ThinkingIndicator'
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

  async function runSend(text: string, m: ChatMode, fromQueue = false) {
    if (!chatId) return
    const userMsg = await api.addMessage({ chat_id: chatId, role: 'user', content: text, mode: m })
    setMessages((prev) => [...prev, userMsg])
    if (messages.length === 0 && !fromQueue) onFirstMessage(chatId, text.slice(0, 48))

    setThinking(true)
    setDraft('')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let started = false
    try {
      // TODO(RAG): inject retrieved memory + campus knowledge as context.
      const full = await streamChat(
        {
          mode: m,
          messages: [...messages, userMsg].map((x) => ({ role: x.role, content: x.content })),
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

  function send() {
    const text = input.trim()
    if (!text || !chatId || streaming || thinking) return
    setInput('')
    if (conn === 'offline') {
      const q = [...readQueue(), { chatId, text, mode }]
      writeQueue(q)
      onQueueChange(q.length)
      // Optimistically show the queued user message.
      setMessages((prev) => [...prev, { id: 'q' + Date.now(), chat_id: chatId, role: 'user', content: text, mode, created_at: new Date().toISOString() }])
      return
    }
    runSend(text, mode)
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
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 26 }}>
            {messages.map((m) => <MessageRow key={m.id} m={m} onReact={(r) => reactTo(m, r)} />)}
            {thinking && <AssistantWrap><ThinkingIndicator /></AssistantWrap>}
            {streaming && <AssistantWrap><WordReveal text={draft} /></AssistantWrap>}
          </div>
        )}
      </div>
      <Composer mode={mode} setMode={setMode} input={input} setInput={setInput} onSend={send} streaming={streaming || thinking} onStop={stop} conn={conn} />
    </main>
  )

  async function reactTo(m: Message, r: 'up' | 'down') {
    const next = m.reaction === r ? null : r
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: next } : x)))
    await api.reactMessage(m.id, next)
  }
}

function AssistantWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="msg" style={{ display: 'flex', gap: 13, animation: 'mz-fadein .3s both' }}>
      <Logo size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{brand.aiName}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function MessageRow({ m, onReact }: { m: Message; onReact: (r: 'up' | 'down') => void }) {
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (m.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '78%', background: '#fff', border: '1px solid var(--line-strong)', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
      </div>
    )
  }
  return (
    <div className="msg" style={{ display: 'flex', gap: 13 }}>
      <Logo size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{brand.aiName}</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>{time}</span>
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.62, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
        <div className="msg-actions" style={{ display: 'flex', gap: 2, marginTop: 8 }}>
          <button className={'act-btn' + (m.reaction === 'up' ? ' on' : '')} onClick={() => onReact('up')}>▲</button>
          <button className={'act-btn' + (m.reaction === 'down' ? ' on' : '')} onClick={() => onReact('down')}>▼</button>
          <button className="act-btn" onClick={() => navigator.clipboard?.writeText(m.content)}>Copy</button>
        </div>
      </div>
    </div>
  )
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

function Composer(p: { mode: ChatMode; setMode: (m: ChatMode) => void; input: string; setInput: (s: string) => void; onSend: () => void; streaming: boolean; onStop: () => void; conn: ConnState }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', background: 'var(--paper-panel)', padding: '14px 0 18px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
        <ModeToggle mode={p.mode} setMode={p.setMode} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: '1px solid var(--line-strong)', borderRadius: 16, background: '#fff', padding: '8px 8px 8px 16px' }}>
          <textarea
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSend() } }}
            placeholder={p.conn === 'offline' ? brand.inputPlaceholderOffline : brand.inputPlaceholder}
            rows={1}
            style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 15, lineHeight: 1.5, maxHeight: 160, background: 'transparent', color: 'var(--ink)', padding: '6px 0' }}
          />
          {p.streaming ? (
            <button onClick={p.onStop} style={btn('#1d1a16')}>■</button>
          ) : (
            <button onClick={p.onSend} style={btn('var(--accent)')}>↑</button>
          )}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', margin: '10px 0 0' }}>{brand.disclaimer}</p>
      </div>
    </div>
  )
}

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
