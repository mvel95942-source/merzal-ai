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
  const [query, setQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEnroll, setManualEnroll] = useState('')
  const [confirmDel, setConfirmDel] = useState<{ name: string; mobile: string } | null>(null)
  const [delText, setDelText] = useState('')
  const [delErr, setDelErr] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guide, setGuide] = useState<{ id?: string; title: string; content: string }>({ title: 'Career guidance', content: '' })
  const [guideSaved, setGuideSaved] = useState(false)

  useEffect(() => { api.listStudents().then(setStudents).catch(() => {}) }, [done])

  async function refresh() { setStudents(await api.listStudents()) }

  async function addManual() {
    setErr(null); setDone(null)
    try {
      await api.addStudent(manualName.trim(), manualEnroll.trim())
      setManualName(''); setManualEnroll('')
      setDone(`Added ${manualEnroll.trim()}.`); await refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add student.') }
  }

  async function confirmDelete() {
    if (!confirmDel) return
    setDelErr(null)
    try {
      await api.deleteStudent(confirmDel.mobile, delText.trim())
      setConfirmDel(null); setDelText(''); setDone(`Deleted ${confirmDel.mobile}.`); await refresh()
    } catch (e) { setDelErr(e instanceof Error ? e.message : 'Could not delete.') }
  }

  async function openGuide() {
    setGuideOpen(true); setGuideSaved(false)
    const g = await api.getCareerGuide()
    if (g) setGuide(g)
  }
  async function saveGuide() {
    try { await api.saveCareerGuide(guide.title.trim() || 'Career guidance', guide.content); setGuideSaved(true) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save guide.') }
  }

  const filtered = students.filter((s) => {
    const q = query.trim().toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.mobile.toLowerCase().includes(q)
  })

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} style={{ height: 46, padding: '0 18px', border: '1px dashed var(--line-strong)', borderRadius: 12, background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ⬆ Choose file{fileName ? ` — ${fileName}` : ''}
          </button>
          <button onClick={openGuide} style={{ height: 46, padding: '0 18px', border: '1px solid var(--line-strong)', borderRadius: 12, background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            📘 Edit career-guidance knowledge
          </button>
        </div>

        {/* Manual add */}
        <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>Add a student manually</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Name" style={input(160)} />
            <input value={manualEnroll} onChange={(e) => setManualEnroll(e.target.value)} placeholder="Enrollment number" style={input(180)} />
            <button onClick={addManual} disabled={!manualName.trim() || !manualEnroll.trim()} style={btn()}>Add</button>
          </div>
        </div>

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '34px 0 10px', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>Current roster ({students.length})</h2>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" style={{ ...input(200), height: 34, marginBottom: 0 }} />
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
          {filtered.length === 0 && <div style={{ padding: 14, color: 'var(--faint)', fontSize: 13 }}>{students.length === 0 ? 'No students yet.' : 'No matches.'}</div>}
          {filtered.slice(0, 300).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{s.name}</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>{s.mobile}</span>
              <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: s.status === 'active' ? 'var(--accent)' : 'var(--faint)' }}>{s.status}</span>
              <button onClick={() => { setConfirmDel({ name: s.name, mobile: s.mobile }); setDelText(''); setDelErr(null) }} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '4px 8px', fontSize: 13 }} title="Delete">🗑️</button>
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirmation modal (Supabase-style: type the enrollment to confirm) */}
      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modalCard}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Delete student?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px', lineHeight: 1.5 }}>
              This will permanently remove <b>{confirmDel.name || confirmDel.mobile}</b>’s account and all their data. This cannot be undone.
            </p>
            <label className="mono" style={{ display: 'block', fontSize: 10.5, letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 6 }}>Type the enrollment number to confirm</label>
            <input autoFocus value={delText} onChange={(e) => setDelText(e.target.value)} placeholder={confirmDel.mobile} style={{ ...input(), fontFamily: 'var(--font-mono, monospace)' }} />
            {delErr && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }}>{delErr}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...btn(), background: '#fff', color: 'var(--ink)', border: '1px solid var(--line-strong)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={delText.trim() !== confirmDel.mobile} style={{ ...btn(), background: 'var(--danger)', opacity: delText.trim() === confirmDel.mobile ? 1 : .5 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Career guidance editor */}
      {guideOpen && (
        <div onClick={() => setGuideOpen(false)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalCard, maxWidth: 720 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Career-guidance knowledge</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>
              Markdown that Campus mode answers from. RAG / GraphRAG will replace inline injection later — see NEXT_SESSION_PLAN.md.
            </p>
            <input value={guide.title} onChange={(e) => setGuide({ ...guide, title: e.target.value })} placeholder="Title" style={input()} />
            <textarea value={guide.content} onChange={(e) => setGuide({ ...guide, content: e.target.value })} placeholder="# Career guidance&#10;&#10;Add your campus-specific guidance here…" rows={16} style={{ ...input(), height: 320, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, padding: '10px 12px' }} />
            {guideSaved && <p style={{ color: 'var(--accent)', fontSize: 13, margin: '6px 0 0' }}>Saved.</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setGuideOpen(false)} style={{ ...btn(), background: '#fff', color: 'var(--ink)', border: '1px solid var(--line-strong)' }}>Close</button>
              <button onClick={saveGuide} style={btn()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const input = (w?: number): React.CSSProperties => ({ flex: w ? undefined : 1, width: w, minWidth: 140, height: 40, border: '1px solid var(--line-strong)', borderRadius: 9, background: '#fff', padding: '0 12px', fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 10 })
const btn = (): React.CSSProperties => ({ height: 40, padding: '0 16px', border: 'none', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' })
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#1d1a1688', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 }
const modalCard: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'var(--paper-panel, #f6f3ec)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px #0003' }

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
