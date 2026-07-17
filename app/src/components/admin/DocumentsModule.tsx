// Documents — permanent knowledge. The PDF content lives in PageIndex; this
// module manages the METADATA that gates retrieval (department / semester /
// section / visibility / type / date window / tags). Metadata is enforced by
// RLS + the chat pipeline, so editing here changes who can get answers from
// the document — instantly, without re-indexing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import type { Department, Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { adminApi, type DocRow } from '../../lib/admin'
import { Badge, Btn, Card, Empty, Modal, Notice, PageHead, S, Th } from './ui'

const DOC_TYPES = ['timetable', 'syllabus', 'notes', 'policy', 'circular', 'other']
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]

export function DocumentsModule({ profile, departments }: { profile: Profile | null; departments: Department[] }) {
  const superAdmin = isSuperAdmin(profile)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<DocRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.code || d.name])), [departments])

  async function refresh() {
    try { setDocs(await adminApi.listDocs()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load documents.') }
  }
  useEffect(() => { refresh() }, [])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(null); setUploading(true)
    try { await api.uploadCampusDoc(file); await refresh() }
    catch (er) { setErr(er instanceof Error ? er.message : 'Upload failed.') }
    finally { setUploading(false) }
  }

  return (
    <div>
      <PageHead
        title="Documents"
        sub="Indexed campus knowledge (PageIndex). Metadata controls who can retrieve each document."
        actions={<>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onFile} />
          <Btn kind="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '⇪ Upload PDF'}</Btn>
        </>}
      />
      {err && <Notice tone="err" text={err} />}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <Th>Name</Th><Th>Type</Th><Th>Dept</Th><Th>Sem</Th>
              <Th>Visibility</Th><Th>Status</Th><Th></Th>
            </tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={S.td}>{d.name}</td>
                  <td style={S.td}>{d.doc_type ?? '—'}</td>
                  <td style={S.td}>{d.department_id ? deptName.get(d.department_id) ?? '—' : 'All'}</td>
                  <td style={S.td}>{d.semester ?? 'All'}</td>
                  <td style={S.td}>{d.visibility}</td>
                  <td style={S.td}>{d.status === 'ready' || d.status === 'completed' ? <Badge tone="ok">indexed</Badge> : <Badge tone="off">{d.status}</Badge>}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <Btn small onClick={() => setEditing(d)}>✎ Metadata</Btn>{' '}
                    {superAdmin && <Btn small kind="danger" onClick={async () => { await api.deleteCampusDoc(d.id); refresh() }}>Delete</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!docs.length && <Empty text="No documents yet. Upload timetables, syllabi, policies, circulars…" />}
      </Card>

      {editing && (
        <MetaModal doc={editing} departments={departments} superAdmin={superAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
          onError={(m) => setErr(m)} />
      )}
    </div>
  )
}

function MetaModal({ doc, departments, superAdmin, onClose, onSaved, onError }: {
  doc: DocRow
  departments: Department[]
  superAdmin: boolean
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [deptId, setDeptId] = useState(doc.department_id ?? '')
  const [semester, setSemester] = useState(doc.semester != null ? String(doc.semester) : '')
  const [section, setSection] = useState(doc.section ?? '')
  const [visibility, setVisibility] = useState(doc.visibility ?? 'all')
  const [docType, setDocType] = useState(doc.doc_type ?? '')
  const [effective, setEffective] = useState(doc.effective_date ?? '')
  const [expiry, setExpiry] = useState(doc.expiry_date ?? '')
  const [tags, setTags] = useState((doc.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await adminApi.updateDocMeta(doc.id, {
        department_id: superAdmin ? (deptId || null) : doc.department_id,
        semester: semester === '' ? null : Number(semester),
        section: section.trim() === '' ? null : section.trim().toUpperCase(),
        visibility, doc_type: docType || null,
        effective_date: effective || null, expiry_date: expiry || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onSaved()
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not save metadata.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Metadata — ${doc.name}`} onClose={onClose} width={520}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Document type</span>
            <select style={{ ...S.input, width: '100%' }} value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="">—</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label><span style={S.label}>Visibility</span>
            <select style={{ ...S.input, width: '100%' }} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="students">Students only</option>
              <option value="admins">Admins only</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Department</span>
            <select style={{ ...S.input, width: '100%' }} value={deptId} disabled={!superAdmin} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code || d.name}</option>)}
            </select>
          </label>
          <label><span style={S.label}>Semester</span>
            <select style={{ ...S.input, width: '100%' }} value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">All</option>
              {SEMESTERS.map((s) => <option key={s} value={s}>Sem {s}</option>)}
            </select>
          </label>
          <label><span style={S.label}>Section</span>
            <input style={{ ...S.input, width: '100%' }} placeholder="All" value={section} onChange={(e) => setSection(e.target.value)} maxLength={4} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Effective date</span>
            <input style={{ ...S.input, width: '100%' }} type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </label>
          <label><span style={S.label}>Expiry date</span>
            <input style={{ ...S.input, width: '100%' }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </label>
        </div>
        <label><span style={S.label}>Tags (comma-separated)</span>
          <input style={{ ...S.input, width: '100%' }} placeholder="exam, sem6, 2026" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
