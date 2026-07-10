import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { Logo } from './Logo'
import type { AdminUser, Department, Profile } from '../lib/types'
import { isDeptAdmin, isSuperAdmin } from '../lib/types'
import { Book, Building, Shield, Trash, Upload } from './Icons'

type Row = { name: string; mobile: string }
type Student = { id: string; name: string; mobile: string; status: string; department_id: string | null; year: number | null }

// Admin page. Two tiers, gated by profile.department_id:
// - Super Admin (role='admin', department_id=null): everything — departments,
//   admin management, campus docs, career guidance, all students.
// - Department Admin (role='admin', department_id set): their own
//   department's roster only. RLS enforces the scoping server-side; this UI
//   just hides the panels that don't apply and fixes the department picker.
export function AdminImport({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const superAdmin = isSuperAdmin(profile)
  const deptAdmin = isDeptAdmin(profile)
  const myDeptId = profile?.department_id ?? null

  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [query, setQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEnroll, setManualEnroll] = useState('')
  const [manualDept, setManualDept] = useState('')
  const [manualYear, setManualYear] = useState('')
  const [bulkDept, setBulkDept] = useState('')
  const [bulkYear, setBulkYear] = useState('')
  const [confirmDel, setConfirmDel] = useState<{ name: string; mobile: string } | null>(null)
  const [delText, setDelText] = useState('')
  const [delErr, setDelErr] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guide, setGuide] = useState<{ id?: string; title: string; content: string }>({ title: 'Career guidance', content: '' })
  const [guideSaved, setGuideSaved] = useState(false)
  const [guideErr, setGuideErr] = useState<string | null>(null)
  const docFileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<{ id: string; doc_id: string; name: string; status: string; created_at: string }[]>([])
  const [docUploading, setDocUploading] = useState(false)
  const [docErr, setDocErr] = useState<string | null>(null)

  // Departments (read for both tiers — needed for pickers + roster labels).
  const [departments, setDepartments] = useState<Department[]>([])
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [deptErr, setDeptErr] = useState<string | null>(null)
  const [confirmDeptDel, setConfirmDeptDel] = useState<Department | null>(null)
  const [deptDelErr, setDeptDelErr] = useState<string | null>(null)

  // Admins (Super Admin only).
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [promoteReg, setPromoteReg] = useState('')
  const [promoteDept, setPromoteDept] = useState('')
  const [adminErr, setAdminErr] = useState<string | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)

  useEffect(() => { api.listStudents().then(setStudents).catch(() => {}) }, [done])
  useEffect(() => { api.listDepartments().then(setDepartments).catch(() => {}) }, [])
  useEffect(() => { if (superAdmin) refreshDocs() }, [superAdmin])
  useEffect(() => { if (superAdmin) refreshAdmins() }, [superAdmin])

  async function refresh() { setStudents(await api.listStudents()) }
  async function refreshDepartments() { setDepartments(await api.listDepartments()) }
  async function refreshAdmins() {
    try { setAdmins(await api.listAdmins()) } catch { /* ignore */ }
  }

  async function refreshDocs() {
    try { setDocs(await api.listCampusDocs()) } catch { /* ignore */ }
  }

  async function onDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setDocErr(null); setDocUploading(true)
    try {
      await api.uploadCampusDoc(file)
      await refreshDocs()
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Upload failed.')
    } finally { setDocUploading(false) }
  }

  async function deleteDoc(id: string) {
    setDocErr(null)
    try {
      await api.deleteCampusDoc(id)
      await refreshDocs()
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Could not delete document.')
    }
  }

  async function addManual() {
    setErr(null); setDone(null)
    try {
      const departmentId = deptAdmin ? myDeptId : (manualDept || null)
      const year = manualYear ? Number(manualYear) : null
      await api.addStudent(manualName.trim(), manualEnroll.trim(), departmentId, year)
      setManualName(''); setManualEnroll(''); setManualYear(''); if (superAdmin) setManualDept('')
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

  async function createDept() {
    setDeptErr(null)
    try {
      await api.createDepartment(newDeptName.trim(), newDeptCode.trim())
      setNewDeptName(''); setNewDeptCode('')
      await refreshDepartments()
    } catch (e) { setDeptErr(e instanceof Error ? e.message : 'Could not create department.') }
  }

  async function confirmDeleteDept() {
    if (!confirmDeptDel) return
    setDeptDelErr(null)
    try {
      await api.deleteDepartment(confirmDeptDel.id)
      setConfirmDeptDel(null)
      await refreshDepartments()
    } catch (e) { setDeptDelErr(e instanceof Error ? e.message : 'Could not delete department.') }
  }

  async function promote() {
    setAdminErr(null); setAdminBusy(true)
    try {
      await api.promoteToDeptAdmin(promoteReg.trim(), promoteDept)
      setPromoteReg(''); setPromoteDept('')
      await refreshAdmins()
    } catch (e) { setAdminErr(e instanceof Error ? e.message : 'Could not promote that student.') }
    finally { setAdminBusy(false) }
  }

  async function demote(userId: string) {
    setAdminErr(null)
    try {
      await api.demoteAdmin(userId)
      await refreshAdmins()
    } catch (e) { setAdminErr(e instanceof Error ? e.message : 'Could not demote that admin.') }
  }

  const filtered = students.filter((s) => {
    const q = query.trim().toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.mobile.toLowerCase().includes(q)
  })

  const deptLabel = (id: string | null) => (id ? departments.find((d) => d.id === id)?.code ?? null : null)
  const myDeptName = departments.find((d) => d.id === myDeptId)?.name

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
      const departmentId = deptAdmin ? myDeptId : (bulkDept || null)
      const year = bulkYear ? Number(bulkYear) : null
      const n = await api.importStudents(rows, { department_id: departmentId, year })
      setDone(`Imported ${n} student${n === 1 ? '' : 's'}.`)
      setRows([]); setFileName(''); setBulkDept(''); setBulkYear('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.')
    } finally { setBusy(false) }
  }

  async function openGuide() {
    setGuideOpen(true); setGuideSaved(false)
    const g = await api.getCareerGuide()
    if (g) setGuide(g)
  }
  async function saveGuide() {
    setGuideErr(null); setGuideSaved(false)
    try { await api.saveCareerGuide(guide.title.trim() || 'Career guidance', guide.content); setGuideSaved(true) }
    catch (e) { setGuideErr(e instanceof Error ? e.message : 'Could not save guide.') }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          Merzal AI · Admin {superAdmin ? '· Super Admin' : deptAdmin ? `· ${myDeptName ?? 'Department'} Admin` : ''}
        </span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 9, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>← Back to chat</button>
      </header>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' }}>
        <h1 className="display" style={{ fontWeight: 400, fontSize: 26, margin: '0 0 6px' }}>Student roster</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>
          {deptAdmin
            ? <>Managing students in <b>{myDeptName ?? 'your department'}</b> only. Upload an Excel (.xlsx) or CSV with columns <b>Student Name</b> and <b>Mobile Number</b>.</>
            : <>Upload an Excel (.xlsx) or CSV with columns <b>Student Name</b> and <b>Mobile Number</b>. Students log in with their mobile + OTP — no manual sign-up.</>}
        </p>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} style={{ height: 46, padding: '0 18px', border: '1px dashed var(--line-strong)', borderRadius: 12, background: 'var(--surface)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Upload size={16} /> Choose file{fileName ? ` — ${fileName}` : ''}
          </button>
          {superAdmin && (
            <button onClick={openGuide} style={{ height: 46, padding: '0 18px', border: '1px solid var(--line-strong)', borderRadius: 12, background: 'var(--surface)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Book size={16} /> Edit career-guidance knowledge
            </button>
          )}
        </div>

        {/* Manual add */}
        <div style={panel}>
          <p style={panelTitle}>Add a student manually</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Name" style={input(160)} />
            <input value={manualEnroll} onChange={(e) => setManualEnroll(e.target.value)} placeholder="Enrollment number" style={input(180)} />
            <select value={deptAdmin ? (myDeptId ?? '') : manualDept} onChange={(e) => setManualDept(e.target.value)} disabled={deptAdmin} style={select(deptAdmin ? undefined : 170)}>
              {deptAdmin
                ? <option value={myDeptId ?? ''}>{myDeptName ?? 'Your department'}</option>
                : <><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</>}
            </select>
            <select value={manualYear} onChange={(e) => setManualYear(e.target.value)} style={select(90)}>
              <option value="">Year</option>
              {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <button onClick={addManual} disabled={!manualName.trim() || !manualEnroll.trim()} style={btn()}>Add</button>
          </div>
        </div>

        {superAdmin && (
          <>
            {/* Departments */}
            <div style={panel}>
              <p style={{ ...panelTitle, display: 'flex', alignItems: 'center', gap: 7 }}><Building size={15} /> Departments</p>
              <div style={listBox}>
                {departments.length === 0 && <div style={emptyRow}>No departments yet.</div>}
                {departments.map((d) => (
                  <div key={d.id} style={rowLine}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', width: 56, flex: 'none' }}>{d.code}</span>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <button onClick={() => { setConfirmDeptDel(d); setDeptDelErr(null) }} style={iconDangerBtn} title="Delete"><Trash size={15} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} placeholder="Department name" style={input(220)} />
                <input value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value)} placeholder="Code, e.g. CSE" style={input(120)} />
                <button onClick={createDept} disabled={!newDeptName.trim() || !newDeptCode.trim()} style={btn()}>Add department</button>
              </div>
              {deptErr && <p style={errText}>{deptErr}</p>}
            </div>

            {/* Admins */}
            <div style={panel}>
              <p style={{ ...panelTitle, display: 'flex', alignItems: 'center', gap: 7 }}><Shield size={15} /> Admins</p>
              <div style={listBox}>
                {admins.length === 0 && <div style={emptyRow}>No admins yet.</div>}
                {admins.map((a) => {
                  const isSelf = a.user_id === profile?.id
                  const disabled = a.is_super || isSelf
                  return (
                    <div key={a.user_id} style={rowLine}>
                      <span style={{ flex: 1 }}>{a.name}</span>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.register_number ?? '—'}</span>
                      <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: a.is_super ? 'var(--accent)' : 'var(--muted)', minWidth: 90, textAlign: 'right' }}>
                        {a.is_super ? 'Super Admin' : (a.department_name ?? '—')}
                      </span>
                      <button
                        onClick={() => demote(a.user_id)}
                        disabled={disabled}
                        title={a.is_super ? 'Super Admins cannot be demoted here' : isSelf ? 'You cannot demote yourself' : 'Demote to student'}
                        style={{ ...iconDangerBtn, opacity: disabled ? 0.3 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input value={promoteReg} onChange={(e) => setPromoteReg(e.target.value)} placeholder="Register number" style={input(170)} />
                <select value={promoteDept} onChange={(e) => setPromoteDept(e.target.value)} style={select(220)}>
                  <option value="">Choose department…</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
                <button onClick={promote} disabled={adminBusy || !promoteReg.trim() || !promoteDept} style={btn()}>Make department admin</button>
              </div>
              {adminErr && <p style={errText}>{adminErr}</p>}
            </div>

            {/* Campus documents (PageIndex) */}
            <div style={panel}>
              <p style={panelTitle}>Campus documents (PageIndex)</p>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Upload PDFs or notes here — Campus mode answers are grounded in these documents (PageIndex retrieves, our AI answers).
              </p>
              <input ref={docFileRef} type="file" accept=".pdf,.md,.txt,.markdown" onChange={onDocFile} style={{ display: 'none' }} />
              <button onClick={() => docFileRef.current?.click()} disabled={docUploading} style={{ ...btn(), background: 'var(--surface)', color: 'var(--ink)', border: '1px dashed var(--line-strong)', opacity: docUploading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {docUploading ? 'Uploading…' : <><Upload size={16} /> Upload document</>}
              </button>
              {docErr && <p style={errText}>{docErr}</p>}
              <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper-app)', overflow: 'hidden' }}>
                {docs.length === 0 && <div style={{ padding: 12, color: 'var(--faint)', fontSize: 13 }}>No documents yet.</div>}
                {docs.map((d) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{d.status}</span>
                    <button onClick={() => deleteDoc(d.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }} title="Delete"><Trash size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {rows.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 8px' }}>{rows.length} valid rows ready to import:</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
              {rows.slice(0, 100).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                  <span>{r.name || <i style={{ color: 'var(--faint)' }}>—</i>}</span><span className="mono" style={{ color: 'var(--muted)' }}>{r.mobile}</span>
                </div>
              ))}
            </div>
            {deptAdmin ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>All rows will be assigned to <b>{myDeptName ?? 'your department'}</b>{bulkYear ? `, Year ${bulkYear}` : ''}.</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Assign all to:</span>
                <select value={bulkDept} onChange={(e) => setBulkDept(e.target.value)} style={{ ...select(180), marginBottom: 0 }}>
                  <option value="">No department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
                <select value={bulkYear} onChange={(e) => setBulkYear(e.target.value)} style={{ ...select(90), marginBottom: 0 }}>
                  <option value="">Year</option>
                  {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            )}
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
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
          {filtered.length === 0 && <div style={{ padding: 14, color: 'var(--faint)', fontSize: 13 }}>{students.length === 0 ? 'No students yet.' : 'No matches.'}</div>}
          {filtered.slice(0, 300).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{s.name}</span>
              {(deptLabel(s.department_id) || s.year) && (
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                  {deptLabel(s.department_id) ?? '—'}{s.year ? ` · Y${s.year}` : ''}
                </span>
              )}
              <span className="mono" style={{ color: 'var(--muted)' }}>{s.mobile}</span>
              <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: s.status === 'active' ? 'var(--accent)' : 'var(--faint)' }}>{s.status}</span>
              <button onClick={() => { setConfirmDel({ name: s.name, mobile: s.mobile }); setDelText(''); setDelErr(null) }} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }} title="Delete"><Trash size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Delete student confirmation modal (Supabase-style: type the enrollment to confirm) */}
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
              <button onClick={() => setConfirmDel(null)} style={{ ...btn(), background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-strong)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={delText.trim() !== confirmDel.mobile} style={{ ...btn(), background: 'var(--danger)', opacity: delText.trim() === confirmDel.mobile ? 1 : .5 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete department confirmation modal */}
      {confirmDeptDel && (
        <div onClick={() => setConfirmDeptDel(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modalCard}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Delete department?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px', lineHeight: 1.5 }}>
              This removes <b>{confirmDeptDel.name}</b> ({confirmDeptDel.code}). Students already assigned to it keep their record but lose the department link.
            </p>
            {deptDelErr && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{deptDelErr}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeptDel(null)} style={{ ...btn(), background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-strong)' }}>Cancel</button>
              <button onClick={confirmDeleteDept} style={{ ...btn(), background: 'var(--danger)' }}>Delete</button>
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
            {guideErr && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '6px 0 0' }}>{guideErr}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setGuideOpen(false)} style={{ ...btn(), background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-strong)' }}>Close</button>
              <button onClick={saveGuide} style={btn()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const input = (w?: number): React.CSSProperties => ({ flex: w ? undefined : 1, width: w, minWidth: 140, height: 40, border: '1px solid var(--line-strong)', borderRadius: 9, background: 'var(--paper-app)', padding: '0 12px', fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 10 })
const select = (w?: number): React.CSSProperties => ({ flex: w ? undefined : 1, width: w, minWidth: 90, height: 40, border: '1px solid var(--line-strong)', borderRadius: 9, background: 'var(--paper-app)', padding: '0 10px', fontSize: 14, color: 'var(--ink)', outline: 'none', marginBottom: 10 })
const btn = (): React.CSSProperties => ({ height: 40, padding: '0 16px', border: 'none', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' })
const panel: React.CSSProperties = { marginTop: 18, padding: 14, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)' }
const panelTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, margin: '0 0 10px' }
const listBox: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper-app)', overflow: 'hidden' }
const rowLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }
const emptyRow: React.CSSProperties = { padding: 12, color: 'var(--faint)', fontSize: 13 }
const iconDangerBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }
const errText: React.CSSProperties = { color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 }
const modalCard: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 22, boxShadow: 'var(--shadow-pop)' }

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
