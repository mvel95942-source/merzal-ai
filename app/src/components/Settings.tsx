import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import type { FeedbackType, MemoryItem, Profile } from '../lib/types'
import { FeedbackForm } from './FeedbackForm'

export function Settings({ profile, onClose, onSignOut }: {
  profile: Profile | null
  onClose: () => void
  onSignOut: () => void
}) {
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [newFact, setNewFact] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  useEffect(() => { api.listMemory().then(setMemory) }, [])

  async function addFact() {
    const f = newFact.trim()
    if (!f) return
    const item = await api.addMemory(f)
    setMemory((m) => [item, ...m])
    setNewFact('')
  }
  async function remove(id: string) {
    await api.removeMemory(id)
    setMemory((m) => m.filter((x) => x.id !== id))
  }
  async function clearAll() {
    await api.clearMemory()
    setMemory([])
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} />
      <div style={{ position: 'relative', width: 'min(460px, 100%)', height: '100%', background: 'var(--paper-panel)', boxShadow: '-20px 0 60px -20px #0004', overflowY: 'auto', animation: 'mz-rise .25s both' }} className="scroll">
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Settings</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: 'var(--muted)' }}>×</button>
        </div>

        <Section title="Memory" subtitle="Durable facts Merzal remembers about you. Edit or clear anytime — stored privately, on campus.">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={newFact} onChange={(e) => setNewFact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFact()} placeholder="e.g. My advisor is Dr. Patel" style={{ ...input, marginBottom: 0 }} />
            <button onClick={addFact} style={{ ...primary, width: 'auto', padding: '0 16px' }}>Add</button>
          </div>
          {memory.length === 0 && <p style={{ fontSize: 13, color: 'var(--faint)' }}>No memories yet. Things you tell Merzal will be saved here.</p>}
          {memory.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>{m.fact}</span>
              <button onClick={() => remove(m.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12.5 }}>Remove</button>
            </div>
          ))}
          {memory.length > 0 && <button onClick={clearAll} style={{ ...ghost, color: 'var(--danger)', marginTop: 6 }}>Clear all memory</button>}
        </Section>

        <Section title="Account">
          {profile?.role === 'admin' && (
            <button onClick={() => { window.location.hash = '#/admin'; onClose() }} style={{ ...ghost, marginBottom: 8, display: 'block' }}>🛠 Admin · Manage students</button>
          )}
          {profile?.role === 'admin' && (
            <button onClick={() => { window.location.hash = '#/feedback'; onClose() }} style={{ ...ghost, marginBottom: 8, display: 'block' }}>📥 Feedback inbox</button>
          )}
          {profile?.role === 'admin' && (
            <button onClick={() => { window.location.hash = '#/analytics'; onClose() }} style={{ ...ghost, marginBottom: 8, display: 'block' }}>📊 Analytics</button>
          )}
          <button onClick={() => setFeedbackOpen(true)} style={{ ...ghost, marginBottom: 8, display: 'block' }}>✍️ Send feedback</button>
          <button onClick={onSignOut} style={ghost}>Sign out</button>
          <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 16, lineHeight: 1.5 }}>{brand.loginFooter}</p>
        </Section>
      </div>
      {feedbackOpen && (
        <FeedbackForm
          onClose={() => setFeedbackOpen(false)}
          onSubmit={async (type: FeedbackType, comment: string) => {
            await api.submitFeedback({ type, comment })
          }}
        />
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 26px', borderBottom: '1px solid var(--line)' }}>
      <h3 className="mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--faint)', margin: '0 0 4px' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>{subtitle}</p>}
      <div style={{ marginTop: subtitle ? 0 : 12 }}>{children}</div>
    </div>
  )
}
const input: React.CSSProperties = { width: '100%', height: 44, border: '1px solid var(--line-strong)', borderRadius: 10, background: 'var(--paper-app)', padding: '0 13px', fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 0 }
const primary: React.CSSProperties = { height: 44, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, padding: '0 18px' }
const ghost: React.CSSProperties = { height: 42, border: '1px solid var(--line-strong)', borderRadius: 10, background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 13.5, fontWeight: 500, padding: '0 18px' }
