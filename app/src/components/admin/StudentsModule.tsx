// Students module — the everyday surface, built for 10,000 rows:
// server-side search + filters + 50-row pages, per-row lifecycle actions.
// Privileged actions go through the `admin` edge function (RBAC + audit there).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Department, Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { adminApi, type StudentFilters, type StudentRow } from '../../lib/admin'
import { Badge, Btn, Card, Empty, Modal, Notice, PageHead, S } from './ui'

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]

export function StudentsModule({ profile, departments }: { profile: Profile | null; departments: Department[] }) {
  const superAdmin = isSuperAdmin(profile)
  const [filters, setFilters] = useState<StudentFilters>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<StudentRow[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [tempPw, setTempPw] = useState<{ name: string; mobile: string; pw: string } | null>(null)
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const searchTimer = useRef<number | null>(null)

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.code || d.name])), [departments])

  async function load(f: StudentFilters, p: number) {
    setBusy(true); setErr(null)
    try {
      const { rows, total } = await adminApi.listStudents(f, p)
      setRows(rows); setTotal(total)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load students.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load(filters, page) }, [filters, page]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(v: string) {
    setSearch(v)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => { setPage(0); setFilters((f) => ({ ...f, search: v })) }, 300)
  }

  async function act(fn: () => Promise<unknown>, doneMsg: string) {
    setErr(null); setOk(null)
    try { await fn(); setOk(doneMsg); await load(filters, page) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Action failed.') }
  }

  async function exportCsv() {
    setErr(null)
    try {
      const csv = await adminApi.exportStudentsCsv(filters)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed.') }
  }

  const pages = Math.max(1, Math.ceil(total / adminApi.PAGE_SIZE))

  return (
    <div>
      <PageHead
        title="Students"
        sub={`${total.toLocaleString()} in scope`}
        actions={<>
          <Btn onClick={() => { window.location.hash = '#/admin/import' }}>⇪ Import</Btn>
          <Btn onClick={exportCsv}>⇩ Export CSV</Btn>
        </>}
      />
      {err && <Notice tone="err" text={err} />}
      {ok && <Notice tone="ok" text={ok} />}

      <Card style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...S.input, flex: '1 1 200px' }} placeholder="Search name or enrollment…" value={search} onChange={(e) => onSearch(e.target.value)} />
          {superAdmin && (
            <select style={S.input} value={filters.department_id ?? ''} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, department_id: e.target.value || undefined })) }}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code || d.name}</option>)}
            </select>
          )}
          <select style={S.input} value={filters.semester ?? ''} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, semester: e.target.value ? Number(e.target.value) : undefined })) }}>
            <option value="">All semesters</option>
            {SEMESTERS.map((s) => <option key={s} value={s}>Sem {s}</option>)}
          </select>
          <select style={S.input} value={filters.status ?? ''} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, status: e.target.value || undefined })) }}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="pending_profile">Never signed in</option>
            <option value="blocked">Disabled</option>
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>Name</th><th style={S.th}>Enrollment</th><th style={S.th}>Dept</th>
              <th style={S.th}>Sem</th><th style={S.th}>Sec</th><th style={S.th}>Status</th><th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={S.td}>{r.name}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.mobile}</td>
                  <td style={S.td}>{r.department_id ? deptName.get(r.department_id) ?? '—' : '—'}</td>
                  <td style={S.td}>{r.semester ?? '—'}</td>
                  <td style={S.td}>{r.section ?? '—'}</td>
                  <td style={S.td}>
                    {r.status === 'blocked' ? <Badge tone="warn">disabled</Badge>
                      : r.status === 'active' ? <Badge tone="ok">active</Badge>
                      : <Badge tone="off">no sign-in yet</Badge>}
                  </td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <Btn small title="Reset password" disabled={!r.user_id}
                      onClick={() => act(async () => {
                        const res = await adminApi.resetPassword(r.id)
                        setTempPw({ name: r.name, mobile: r.mobile, pw: res.tempPassword })
                      }, `Password reset for ${r.mobile}.`)}>⟲ Reset</Btn>{' '}
                    {r.status === 'blocked'
                      ? <Btn small onClick={() => act(() => adminApi.enableAccount(r.id), `Enabled ${r.mobile}.`)}>🔓 Enable</Btn>
                      : <Btn small kind="danger" onClick={() => act(() => adminApi.disableAccount(r.id), `Disabled ${r.mobile}.`)}>🔒 Disable</Btn>}{' '}
                    <Btn small onClick={() => setEditing(r)}>✎ Edit</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && !busy && <Empty text="No students match. Import a roster or adjust the filters." />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Page {page + 1} of {pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn small disabled={page === 0} onClick={() => setPage((p) => p - 1)}>◂ Prev</Btn>
            <Btn small disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next ▸</Btn>
          </div>
        </div>
      </Card>

      {tempPw && (
        <Modal title="Temporary password" onClose={() => setTempPw(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 0 }}>
            Hand this to <b>{tempPw.name}</b> ({tempPw.mobile}). It is shown once — they must
            choose a new password at their next sign-in.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '.06em', padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, textAlign: 'center', userSelect: 'all' }}>
            {tempPw.pw}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <Btn onClick={() => navigator.clipboard?.writeText(tempPw.pw)}>Copy</Btn>
            <Btn kind="primary" onClick={() => setTempPw(null)}>Done</Btn>
          </div>
        </Modal>
      )}

      {editing && (
        <EditStudentModal
          student={editing} departments={departments} superAdmin={superAdmin}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); setOk(msg); await load(filters, page) }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  )
}

// Semester / section for everyone in scope; department move is Super Admin
// only (a Dept Admin moving students between departments is cross-department
// access by definition — the edge function refuses it too).
function EditStudentModal({ student, departments, superAdmin, onClose, onSaved, onError }: {
  student: StudentRow
  departments: Department[]
  superAdmin: boolean
  onClose: () => void
  onSaved: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [semester, setSemester] = useState(student.semester != null ? String(student.semester) : '')
  const [section, setSection] = useState(student.section ?? '')
  const [dept, setDept] = useState(student.department_id ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const sem = semester === '' ? null : Number(semester)
      const sec = section.trim() === '' ? null : section.trim().toUpperCase()
      if (sem !== student.semester || sec !== student.section) await adminApi.setSemesterSection(student.id, sem, sec)
      const newDept = dept || null
      if (superAdmin && newDept !== student.department_id) await adminApi.moveDepartment(student.id, newDept)
      onSaved(`Updated ${student.mobile}.`)
    } catch (e) { onError(e instanceof Error ? e.message : 'Update failed.'); onClose() }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Edit ${student.name}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        {superAdmin && (
          <label><span style={S.label}>Department</span>
            <select style={{ ...S.input, width: '100%' }} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">No department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Semester</span>
            <select style={{ ...S.input, width: '100%' }} value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">—</option>
              {SEMESTERS.map((s) => <option key={s} value={s}>Sem {s}</option>)}
            </select>
          </label>
          <label><span style={S.label}>Section</span>
            <input style={{ ...S.input, width: '100%' }} placeholder="A" value={section} onChange={(e) => setSection(e.target.value)} maxLength={4} />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
