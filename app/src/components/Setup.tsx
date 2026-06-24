import { useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { Logo } from './Logo'

export function Setup({ onDone }: { onDone: () => void }) {
  const [dept, setDept] = useState<string>(brand.departments[0])
  const [sem, setSem] = useState<number>(brand.semesters[0])
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api.upsertProfile({ department: dept, semester: sem, onboarding_done: true })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1d1a16', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--paper-panel)', borderRadius: 20, padding: '36px 32px 32px', boxShadow: '0 32px 80px -20px #00000088', animation: 'mz-rise .5s cubic-bezier(.16,1,.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Logo size={36} />
          <div>
            <div className="display" style={{ fontSize: 20, fontWeight: 500, color: '#1a1612', lineHeight: 1.1 }}>{brand.name}</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>One-time setup</div>
          </div>
        </div>

        <h2 className="display" style={{ fontWeight: 400, fontSize: 32, margin: '0 0 6px', letterSpacing: '-.015em', color: '#1a1612' }}>Tell us about yourself</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.5 }}>So Merzal can give you the most relevant answers for your department and semester.</p>

        <label className="mono" style={lbl}>Department</label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={select}>
          {brand.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <label className="mono" style={lbl}>Semester</label>
        <select value={sem} onChange={(e) => setSem(Number(e.target.value))} style={{ ...select, marginBottom: 28 }}>
          {brand.semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
        </select>

        <button onClick={save} disabled={busy} style={{ width: '100%', height: 48, border: 'none', borderRadius: 11, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy ? 'Saving…' : 'Get started'} <span className="mono">→</span>
        </button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9b9488', marginBottom: 8 }
const select: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--line-strong)', borderRadius: 11, background: '#fff', padding: '0 15px', fontSize: 15, color: 'var(--ink)', outline: 'none', marginBottom: 18, cursor: 'pointer' }
