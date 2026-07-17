// Import wizard — production roster onboarding in four explicit steps:
//   1 Upload   .xlsx / .csv, drag-drop, template download
//   2 Map      auto-detected columns, remappable
//   3 Review   per-row validation, in-file + in-DB duplicate detection,
//              defaults for department / semester / section
//   4 Commit   batched writes with live progress (aria-live), audit entry,
//              downloadable error report
// XLSX is imported dynamically so students (and the panel shell) never pay
// for the 400 kB parser chunk.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Department, Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { adminApi, type ImportResult, type ImportRow } from '../../lib/admin'
import { Badge, Btn, Card, Notice, PageHead, S, Th } from './ui'

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]
type Step = 1 | 2 | 3 | 4
type RawTable = { headers: string[]; rows: string[][] }
type Mapping = { name: number; enrollment: number; department: number; semester: number; section: number } // -1 = not present

const FIELD_LABELS: { key: keyof Mapping; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Student name', required: true },
  { key: 'enrollment', label: 'Enrollment / register number', required: true },
  { key: 'department', label: 'Department (name or code)' },
  { key: 'semester', label: 'Semester' },
  { key: 'section', label: 'Section' },
]

// Header auto-detection: forgiving about naming so most files map themselves.
function autoDetect(headers: string[]): Mapping {
  const find = (...pats: RegExp[]) => headers.findIndex((h) => pats.some((p) => p.test(h.trim().toLowerCase())))
  return {
    name: find(/name/),
    enrollment: find(/enrol/, /register/, /reg\s*no/, /roll/, /mobile/, /admission/),
    department: find(/dept/, /department/, /branch/),
    semester: find(/sem/),
    section: find(/^sec/, /section/),
  }
}

export function ImportModule({ profile, departments }: { profile: Profile | null; departments: Department[] }) {
  const superAdmin = isSuperAdmin(profile)
  const myDept = profile?.department_id ?? null

  const [step, setStep] = useState<Step>(1)
  const [err, setErr] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [raw, setRaw] = useState<RawTable | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [defaultDept, setDefaultDept] = useState<string>(superAdmin ? '' : myDept ?? '')
  const [defaultSem, setDefaultSem] = useState('')
  const [defaultSec, setDefaultSec] = useState('')
  const [updateExisting, setUpdateExisting] = useState(false)
  const [existing, setExisting] = useState<Set<string> | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const stepHeadRef = useRef<HTMLHeadingElement>(null)

  // Move screen-reader + keyboard focus to the step heading on step change.
  useEffect(() => { stepHeadRef.current?.focus() }, [step])

  // Departments lookup: accept id, code, or name (case-insensitive).
  const deptLookup = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of departments) {
      m.set(d.id.toLowerCase(), d.id)
      if (d.code) m.set(d.code.toLowerCase(), d.id)
      m.set(d.name.toLowerCase(), d.id)
    }
    return m
  }, [departments])
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.code || d.name])), [departments])

  // ── Step 1: parse the file ────────────────────────────────────────────
  async function parseFile(file: File) {
    setErr(null)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as string[][]
      const nonEmpty = grid.filter((r) => r.some((c) => String(c).trim() !== ''))
      if (nonEmpty.length < 2) { setErr('That file has no data rows. Row 1 must be headers, students below it.'); return }
      const headers = nonEmpty[0].map((h) => String(h).trim())
      const rows = nonEmpty.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
      setFileName(file.name)
      setRaw({ headers, rows })
      setMapping(autoDetect(headers))
      setStep(2)
    } catch {
      setErr('Could not read that file. Use .xlsx, .xls or .csv with a header row.')
    }
  }

  function downloadTemplate() {
    const csv = 'Student Name,Enrollment Number,Department,Semester,Section\nPriya S,975116,CSE,6,A\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'merzal-student-import-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── Step 3 data: validate + normalize every row ───────────────────────
  const prepared = useMemo(() => {
    if (!raw || !mapping) return null
    const seen = new Set<string>()
    const good: ImportRow[] = []
    const bad: { line: number; reason: string; cells: string[] }[] = []
    raw.rows.forEach((cells, idx) => {
      const line = idx + 2 // 1-based + header row
      const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '')
      const name = get(mapping.name).trim()
      const mobile = get(mapping.enrollment).replace(/\D/g, '')
      if (!name) { bad.push({ line, reason: 'Missing name', cells }); return }
      if (mobile.length < 4) { bad.push({ line, reason: 'Missing or invalid enrollment number', cells }); return }
      if (seen.has(mobile)) { bad.push({ line, reason: `Duplicate of an earlier row (${mobile})`, cells }); return }
      seen.add(mobile)

      const deptRawVal = get(mapping.department).trim().toLowerCase()
      let department_id = deptRawVal ? deptLookup.get(deptRawVal) ?? null : null
      if (deptRawVal && !department_id) { bad.push({ line, reason: `Unknown department "${get(mapping.department).trim()}"`, cells }); return }
      if (!department_id) department_id = defaultDept || null
      if (!superAdmin) department_id = myDept // HOD imports always land in their own department

      const semRaw = get(mapping.semester).replace(/\D/g, '')
      const semester = semRaw ? Number(semRaw) : defaultSem ? Number(defaultSem) : null
      if (semester != null && (semester < 1 || semester > 12)) { bad.push({ line, reason: `Semester "${semRaw}" out of range`, cells }); return }
      const section = (get(mapping.section).trim() || defaultSec.trim() || '').toUpperCase() || null

      good.push({ name, mobile, department_id, semester, section })
    })
    return { good, bad }
  }, [raw, mapping, defaultDept, defaultSem, defaultSec, deptLookup, superAdmin, myDept])

  // DB duplicate check when entering review.
  useEffect(() => {
    if (step !== 3 || !prepared) return
    setExisting(null)
    adminApi.existingEnrollments(prepared.good.map((r) => r.mobile)).then(setExisting).catch(() => setExisting(new Set()))
  }, [step, prepared])

  const dupCount = existing && prepared ? prepared.good.filter((r) => existing.has(r.mobile)).length : 0
  const newCount = prepared && existing ? prepared.good.length - dupCount : prepared?.good.length ?? 0

  // ── Step 4: commit ─────────────────────────────────────────────────────
  async function commit() {
    if (!prepared) return
    setStep(4)
    setResult(null)
    setProgress({ done: 0, total: prepared.good.length })
    try {
      const r = await adminApi.importStudents(prepared.good, { updateExisting }, (done, total) => setProgress({ done, total }))
      setResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.')
      setStep(3)
    }
  }

  function downloadErrors() {
    if (!prepared?.bad.length) return
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = ['line,reason,row', ...prepared.bad.map((b) => `${b.line},${esc(b.reason)},${esc(b.cells.join(' | '))}`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'import-errors.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function reset() {
    setStep(1); setRaw(null); setMapping(null); setFileName(''); setResult(null); setProgress(null); setErr(null); setExisting(null)
  }

  const steps = ['Upload', 'Map columns', 'Review', 'Import']

  return (
    <div>
      <PageHead title="Import students" sub="Excel or CSV roster → validated, department-scoped accounts" />
      {err && <Notice tone="err" text={err} />}

      {/* Progress rail */}
      <ol aria-label="Import steps" style={{ display: 'flex', gap: 6, listStyle: 'none', padding: 0, margin: '0 0 16px', flexWrap: 'wrap' }}>
        {steps.map((label, i) => {
          const n = (i + 1) as Step
          const state = n < step ? 'done' : n === step ? 'current' : 'todo'
          return (
            <li key={label} aria-current={state === 'current' ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                background: state === 'current' ? 'var(--ink)' : 'var(--surface-soft)',
                color: state === 'current' ? 'var(--paper)' : state === 'done' ? 'var(--accent)' : 'var(--muted)',
              }}>
              <span aria-hidden="true">{state === 'done' ? '✓' : n}</span> {label}
            </li>
          )
        })}
      </ol>

      {/* ── STEP 1 · UPLOAD ── */}
      {step === 1 && (
        <Card>
          <h2 ref={stepHeadRef} tabIndex={-1} style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px', outline: 'none' }}>Upload a roster file</h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 14px' }}>
            .xlsx, .xls or .csv with a header row. Needs at least <b>Student Name</b> and <b>Enrollment Number</b>;
            Department, Semester and Section columns are used when present. Students sign in with the enrollment
            number and create their password at first login.
          </p>
          <div
            role="button" tabIndex={0} aria-label="Upload roster file — click or drop a file here"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f) }}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--line-strong)'}`, borderRadius: 12,
              padding: '38px 16px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--accent-soft)' : 'var(--surface)',
            }}>
            <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--ink)' }}>Drop the file here, or click to choose</div>
            <div style={{ fontSize: 12.5, color: 'var(--faint)', marginTop: 5 }}>Up to ~10,000 rows per file</div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) parseFile(f) }} />
          <div style={{ marginTop: 12 }}>
            <Btn onClick={downloadTemplate}>⇩ Download template</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 2 · MAP ── */}
      {step === 2 && raw && mapping && (
        <Card>
          <h2 ref={stepHeadRef} tabIndex={-1} style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px', outline: 'none' }}>Map columns</h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 14px' }}>
            <b>{fileName}</b> — {raw.rows.length.toLocaleString()} rows. Columns were auto-detected; correct any that are wrong.
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
            {FIELD_LABELS.map((f) => (
              <label key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
                <span style={{ ...S.label, marginBottom: 0 }}>{f.label}{f.required && <span aria-hidden="true"> *</span>}</span>
                <select style={S.input} value={mapping[f.key]} required={f.required}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>{f.required ? 'Choose a column…' : 'Not in this file'}</option>
                  {raw.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Btn onClick={reset}>← Different file</Btn>
            <Btn kind="primary" disabled={mapping.name < 0 || mapping.enrollment < 0} onClick={() => setStep(3)}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 3 · REVIEW ── */}
      {step === 3 && prepared && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <h2 ref={stepHeadRef} tabIndex={-1} style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px', outline: 'none' }}>Review before import</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span><b style={{ color: 'var(--accent)' }}>{newCount.toLocaleString()}</b> new</span>
              <span><b>{existing ? dupCount.toLocaleString() : '…'}</b> already registered {updateExisting ? '(will be updated)' : '(will be skipped)'}</span>
              <span><b style={{ color: prepared.bad.length ? 'var(--danger)' : 'inherit' }}>{prepared.bad.length.toLocaleString()}</b> rows with problems (never imported)</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update department / semester / section of already-registered students from this file
            </label>
          </Card>

          <Card>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px' }}>Defaults for rows missing a value</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label><span style={S.label}>Department</span>
                <select style={S.input} value={defaultDept} disabled={!superAdmin} onChange={(e) => setDefaultDept(e.target.value)}>
                  {superAdmin && <option value="">No default</option>}
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.code || d.name}</option>)}
                </select>
              </label>
              <label><span style={S.label}>Semester</span>
                <select style={S.input} value={defaultSem} onChange={(e) => setDefaultSem(e.target.value)}>
                  <option value="">No default</option>
                  {SEMESTERS.map((s) => <option key={s} value={s}>Sem {s}</option>)}
                </select>
              </label>
              <label><span style={S.label}>Section</span>
                <input style={S.input} placeholder="No default" value={defaultSec} maxLength={4} onChange={(e) => setDefaultSec(e.target.value)} />
              </label>
            </div>
            {!superAdmin && <p style={{ fontSize: 12.5, color: 'var(--faint)', margin: '8px 0 0' }}>As a Department Admin, every imported student lands in your department.</p>}
          </Card>

          {prepared.bad.length > 0 && (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--danger)' }}>Problem rows (excluded)</span>
                <Btn small onClick={downloadErrors}>⇩ Error report</Btn>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><Th>Line</Th><Th>Problem</Th><Th>Row</Th></tr></thead>
                  <tbody>
                    {prepared.bad.slice(0, 100).map((b) => (
                      <tr key={b.line}>
                        <td style={S.td}>{b.line}</td>
                        <td style={{ ...S.td, color: 'var(--danger)' }}>{b.reason}</td>
                        <td style={{ ...S.td, color: 'var(--muted)', fontSize: 12.5 }}>{b.cells.join(' · ').slice(0, 80)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>
              Preview (first 8 of {prepared.good.length.toLocaleString()})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Name</Th><Th>Enrollment</Th><Th>Dept</Th><Th>Sem</Th><Th>Sec</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {prepared.good.slice(0, 8).map((r) => (
                    <tr key={r.mobile}>
                      <td style={S.td}>{r.name}</td>
                      <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.mobile}</td>
                      <td style={S.td}>{r.department_id ? deptName.get(r.department_id) ?? '—' : '—'}</td>
                      <td style={S.td}>{r.semester ?? '—'}</td>
                      <td style={S.td}>{r.section ?? '—'}</td>
                      <td style={S.td}>{existing?.has(r.mobile) ? <Badge tone="off">registered</Badge> : <Badge tone="ok">new</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => setStep(2)}>← Back</Btn>
            <Btn kind="primary" disabled={!prepared.good.length || existing === null} onClick={commit}>
              Import {prepared.good.length.toLocaleString()} students
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 4 · COMMIT ── */}
      {step === 4 && (
        <Card>
          <h2 ref={stepHeadRef} tabIndex={-1} style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px', outline: 'none' }}>
            {result ? 'Import finished' : 'Importing…'}
          </h2>
          {/* aria-live so screen readers hear progress + the final summary */}
          <div aria-live="polite">
            {!result && progress && (
              <>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
                  aria-label="Import progress"
                  style={{ height: 10, borderRadius: 999, background: 'var(--surface-soft)', overflow: 'hidden', maxWidth: 420 }}>
                  <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`, background: 'var(--accent)', transition: 'width .2s ease' }} />
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8 }}>{progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows written…</p>
              </>
            )}
            {result && (
              <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                <span>✅ <b>{result.inserted.toLocaleString()}</b> students added</span>
                {result.updated > 0 && <span>♻️ <b>{result.updated.toLocaleString()}</b> existing students updated</span>}
                {result.skipped > 0 && <span>⏭️ <b>{result.skipped.toLocaleString()}</b> already registered — skipped</span>}
                {result.failed > 0 && <span style={{ color: 'var(--danger)' }}>⚠️ <b>{result.failed.toLocaleString()}</b> failed: {result.errors[0]}</span>}
              </div>
            )}
          </div>
          {result && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Btn kind="primary" onClick={() => { window.location.hash = '#/admin/students' }}>View students</Btn>
              <Btn onClick={reset}>Import another file</Btn>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
