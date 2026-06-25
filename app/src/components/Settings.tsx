import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import type { MemoryItem, Profile } from '../lib/types'

export function Settings({ profile, onClose, onSignOut, onProfile }: {
  profile: Profile | null
  onClose: () => void
  onSignOut: () => void
  onProfile: (p: Partial<Profile>) => void
}) {
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [newFact, setNewFact] = useState('')
  const [dept, setDept] = useState<string>(profile?.department ?? brand.departments[0])
  const [sem, setSem] = useState<number>(profile?.semester ?? brand.semesters[0])

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
  async function saveProfile() {
    await api.upsertProfile({ department: dept, semester: sem })
    onProfile({ department: dept, semester: sem })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: '#1d1a1655' }} />
      <div style={{ position: 'relative', width: 'min(460px, 100%)', height: '100%', background: 'var(--paper-panel)', boxShadow: '-20px 0 60px -20px #0004', overflowY: 'auto', animation: 'mz-rise .25s both' }} className="scroll">
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Settings</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: 'var(--muted)' }}>×</button>
        </div>

        <Section title="Profile">
          <Field label="Department">
            <select value={dept} onChange={(e) => setDept(e.target.value)} style={input}>
              {brand.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Semester">
            <select value={sem} onChange={(e) => setSem(Number(e.target.value))} style={input}>
              {brand.semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </Field>
          <button onClick={saveProfile} style={primary}>Save profile</button>
        </Section>

        <Section title="Memory" subtitle="Durable facts Merzal remembers about you. Edit or clear anytime — stored privately, on campus.">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={newFact} onChange={(e) => setNewFact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFact()} placeholder="e.g. My advisor is Dr. Patel" style={{ ...input, marginBottom: 0 }} />
            <button onClick={addFact} style={{ ...primary, width: 'auto', padding: '0 16px' }}>Add</button>
          </div>
          {memory.length === 0 && <p style={{ fontSize: 13, color: 'var(--faint)' }}>No memories yet. Things you tell Merzal will be saved here.</p>}
          {memory.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff', marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>{m.fact}</span>
              <button onClick={() => remove(m.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12.5 }}>Remove</button>
            </div>
          ))}
          {memory.length > 0 && <button onClick={clearAll} style={{ ...ghost, color: 'var(--danger)', marginTop: 6 }}>Clear all memory</button>}
        </Section>

        <Section title="Account">
          {profile?.role === 'admin' && (
            <button onClick={() => { window.location.hash = '#/admin'; onClose() }} style={{ ...ghost, marginBottom: 8 }}>🛠 Admin · Manage students</button>
          )}
          <button onClick={onSignOut} style={ghost}>Sign out</button>
          <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 16, lineHeight: 1.5 }}>{brand.loginFooter}</p>
        </Section>
      </div>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="mono" style={{ display: 'block', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9b9488', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
const input: React.CSSProperties = { width: '100%', height: 44, border: '1px solid var(--line-strong)', borderRadius: 10, background: '#fff', padding: '0 13px', fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 0 }
const primary: React.CSSProperties = { height: 44, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, padding: '0 18px' }
const ghost: React.CSSProperties = { height: 42, border: '1px solid var(--line-strong)', borderRadius: 10, background: '#fff', color: 'var(--ink-soft)', fontSize: 13.5, fontWeight: 500, padding: '0 18px' }
