import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { Logo } from './Logo'

type Row = { name: string; mobile: string }

// Super Admin page: upload an .xlsx/.csv roster (Student Name + Mobile Number),
// preview, and import into the students table (RLS allows admins only).
export function AdminImport({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [students, setStudents] = useState<{ id: string; name: string; mobile: string; status: string }[]>([])

  useEffect(() => { api.listStudents().then(setStudents).catch(() => {}) }, [done])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setDone(null)
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const parsed = json.map(pickRow).filter((r): r is Row => !!r && !!r.mobile && r.mobile.length >= 6)
      if (!parsed.length) return setErr('No valid rows found. Need columns: Student Name, Mobile Number.')
      // dedupe by mobile
      const seen = new Set<string>()
      setRows(parsed.filter((r) => !seen.has(r.mobile) && seen.add(r.mobile)))
    } catch {
      setErr('Could not read that file. Upload a valid .xlsx or .csv.')
    }
  }

  async function doImport() {
    setBusy(true); setErr(null)
    try {
      const n = await api.importStudents(rows)
      setDone(`Imported ${n} student${n === 1 ? '' : 's'}.`)
      setRows([]); setFileName('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} /><span style={{ fontWeight: 600, fontSize: 15 }}>Merzal AI · Admin</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1px solid var(--line-strong)', background: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>← Back to chat</button>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' }}>
        <h1 className="display" style={{ fontWeight: 400, fontSize: 26, margin: '0 0 6px' }}>Student roster</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>Upload an Excel (.xlsx) or CSV with columns <b>Student Name</b> and <b>Mobile Number</b>. Students log in with their mobile + OTP — no manual sign-up.</p>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{ height: 46, padding: '0 18px', border: '1px dashed var(--line-strong)', borderRadius: 12, background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ⬆ Choose file{fileName ? ` — ${fileName}` : ''}
        </button>

        {rows.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{rows.length} valid rows ready to import:</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
              {rows.slice(0, 100).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                  <span>{r.name || <i style={{ color: 'var(--faint)' }}>—</i>}</span><span className="mono" style={{ color: 'var(--muted)' }}>{r.mobile}</span>
                </div>
              ))}
            </div>
            <button onClick={doImport} disabled={busy} style={{ marginTop: 14, height: 46, padding: '0 22px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {busy ? 'Importing…' : `Import ${rows.length} students`}
            </button>
          </div>
        )}

        {done && <p style={{ color: 'var(--accent)', fontSize: 13.5, marginTop: 14 }}>{done}</p>}
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }}>{err}</p>}

        <h2 style={{ fontSize: 15, margin: '34px 0 10px' }}>Current roster ({students.length})</h2>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
          {students.length === 0 && <div style={{ padding: 14, color: 'var(--faint)', fontSize: 13 }}>No students yet.</div>}
          {students.slice(0, 200).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{s.name}</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>{s.mobile}</span>
              <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: s.status === 'active' ? 'var(--accent)' : 'var(--faint)' }}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Flexible header matching for the two required columns.
function pickRow(o: Record<string, unknown>): Row | null {
  const entries = Object.entries(o)
  const find = (re: RegExp) => entries.find(([k]) => re.test(k.toLowerCase().trim()))?.[1]
  const name = String(find(/name|student/) ?? '').trim()
  const mobileRaw = String(find(/mobile|phone|number|contact/) ?? '')
  const mobile = mobileRaw.replace(/\D/g, '')
  if (!mobile) return null
  return { name, mobile }
}
