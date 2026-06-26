import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { Logo } from './Logo'

// One-time onboarding, shaped by brand.audience:
//   college → Department + Semester
//   school  → Class + Section   (stored as "<Class> · <Section>" in department)
//   open    → skipped entirely (auto-completes, no screen)
export function Setup({ onDone }: { onDone: () => void }) {
  const isSchool = brand.audience === 'school'
  const [field1, setField1] = useState<string>(isSchool ? brand.classes[0] : brand.departments[0])
  const [field2, setField2] = useState<string>(isSchool ? brand.sections[0] : String(brand.semesters[0]))
  const [busy, setBusy] = useState(false)

  // 'open' audience: no questions — mark done and continue.
  useEffect(() => {
    if (brand.audience === 'open') {
      api.upsertProfile({ onboarding_done: true }).finally(onDone)
    }
  }, [onDone])

  if (brand.audience === 'open') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#1d1a16', color: '#cabfa9' }} className="mono">Getting things ready…</div>
  }

  async function save() {
    setBusy(true)
    try {
      if (isSchool) {
        await api.upsertProfile({ department: `${field1} · ${field2}`, onboarding_done: true })
      } else {
        await api.upsertProfile({ department: field1, semester: Number(field2), onboarding_done: true })
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const f1Label = isSchool ? 'Class' : 'Department'
  const f2Label = isSchool ? 'Section' : 'Semester'
  const f1Options = isSchool ? brand.classes : brand.departments
  const f2Options = isSchool ? brand.sections : brand.semesters.map(String)
  const f2Render = (v: string) => (isSchool ? `Section ${v}` : `Semester ${v}`)

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
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.5 }}>So {brand.shortName} can give you the most relevant answers for your {f1Label.toLowerCase()} and {f2Label.toLowerCase()}.</p>

        <label className="mono" style={lbl}>{f1Label}</label>
        <select value={field1} onChange={(e) => setField1(e.target.value)} style={select}>
          {f1Options.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <label className="mono" style={lbl}>{f2Label}</label>
        <select value={field2} onChange={(e) => setField2(e.target.value)} style={{ ...select, marginBottom: 28 }}>
          {f2Options.map((s) => <option key={s} value={s}>{f2Render(s)}</option>)}
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
