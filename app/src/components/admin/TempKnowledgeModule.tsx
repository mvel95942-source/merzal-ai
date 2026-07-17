// Temporary Knowledge — the announcement layer. Rows here are merged into the
// system prompt of every matching student's chat while valid; nothing is ever
// indexed, so posting "tomorrow is a holiday" costs zero PageIndex capacity
// and takes effect on the very next question.
import { useEffect, useMemo, useState } from 'react'
import type { Department, Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { adminApi, type TempKnowledge } from '../../lib/admin'
import { Badge, Btn, Card, Empty, Modal, Notice, PageHead, S } from './ui'

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]

function fmtWhen(iso: string): string {
  const d = new Date(iso), now = Date.now()
  const h = Math.round((d.getTime() - now) / 3_600_000)
  if (h < -48) return `${Math.round(-h / 24)}d ago`
  if (h < 0) return `${-h}h ago`
  if (h < 48) return `in ${h}h`
  return `in ${Math.round(h / 24)}d`
}

// datetime-local wants local time without zone; default expiry = tomorrow 6 PM.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function defaultExpiry(): string {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0)
  return toLocalInput(d)
}

export function TempKnowledgeModule({ profile, departments }: { profile: Profile | null; departments: Department[] }) {
  const superAdmin = isSuperAdmin(profile)
  const [items, setItems] = useState<TempKnowledge[]>([])
  const [editing, setEditing] = useState<Partial<TempKnowledge> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.code || d.name])), [departments])

  async function refresh() {
    try { setItems(await adminApi.listTempKnowledge()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load updates.') }
  }
  useEffect(() => { refresh() }, [])

  const live = (it: TempKnowledge) => it.active && new Date(it.expires_at).getTime() > Date.now() && new Date(it.starts_at).getTime() <= Date.now()

  return (
    <div>
      <PageHead
        title="Temporary updates"
        sub="Short-lived facts merged into every matching chat — never indexed, free to post"
        actions={<Btn kind="primary" onClick={() => setEditing({ visibility: 'all', priority: 0, department_id: superAdmin ? null : profile?.department_id ?? null })}>+ New update</Btn>}
      />
      {err && <Notice tone="err" text={err} />}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((it) => (
          <Card key={it.id} style={{ padding: '12px 14px', opacity: live(it) ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{it.title}</span>
                  {live(it) ? <Badge tone="ok">live</Badge> : it.active ? <Badge tone="off">scheduled / expired</Badge> : <Badge tone="off">off</Badge>}
                  {it.priority > 0 && <Badge tone="info">priority {it.priority}</Badge>}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: '4px 0' }}>{it.content}</div>
                <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {it.department_id ? deptName.get(it.department_id) ?? 'dept' : 'Whole campus'}
                  {it.semester ? ` · Sem ${it.semester}` : ''}{it.section ? ` · Sec ${it.section}` : ''}
                  {` · ${it.visibility}`} · expires {fmtWhen(it.expires_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Btn small onClick={() => setEditing(it)}>Edit</Btn>
                <Btn small onClick={async () => { await adminApi.setTempKnowledgeActive(it.id, !it.active); refresh() }}>{it.active ? 'Deactivate' : 'Activate'}</Btn>
                <Btn small kind="danger" onClick={async () => { await adminApi.deleteTempKnowledge(it.id); refresh() }}>Delete</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!items.length && <Card><Empty text="No updates yet. Post one — it reaches students on their next question." /></Card>}

      {editing && (
        <EditModal
          item={editing} departments={departments} superAdmin={superAdmin} myDept={profile?.department_id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  )
}

function EditModal({ item, departments, superAdmin, myDept, onClose, onSaved, onError }: {
  item: Partial<TempKnowledge>
  departments: Department[]
  superAdmin: boolean
  myDept: string | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [content, setContent] = useState(item.content ?? '')
  const [dept, setDept] = useState(item.department_id ?? (superAdmin ? '' : myDept ?? ''))
  const [semester, setSemester] = useState(item.semester != null ? String(item.semester) : '')
  const [section, setSection] = useState(item.section ?? '')
  const [visibility, setVisibility] = useState<TempKnowledge['visibility']>(item.visibility ?? 'all')
  const [priority, setPriority] = useState(String(item.priority ?? 0))
  const [startsAt, setStartsAt] = useState(item.starts_at ? toLocalInput(new Date(item.starts_at)) : toLocalInput(new Date()))
  const [expiresAt, setExpiresAt] = useState(item.expires_at ? toLocalInput(new Date(item.expires_at)) : defaultExpiry())
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim() || !content.trim()) { onError('Title and content are required.'); return }
    if (new Date(expiresAt) <= new Date(startsAt)) { onError('Expiry must be after the start time.'); return }
    setBusy(true)
    try {
      await adminApi.saveTempKnowledge({
        id: item.id, title: title.trim(), content: content.trim(),
        department_id: superAdmin ? (dept || null) : (myDept ?? null),
        semester: semester === '' ? null : Number(semester),
        section: section.trim() === '' ? null : section.trim().toUpperCase(),
        visibility, priority: Number(priority) || 0,
        starts_at: new Date(startsAt).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        active: item.active ?? true,
      })
      onSaved()
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={item.id ? 'Edit update' : 'New update'} onClose={onClose} width={520}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label><span style={S.label}>Title</span>
          <input style={{ ...S.input, width: '100%' }} placeholder="Lab shifted to Room 305" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label><span style={S.label}>Content</span>
          <textarea style={{ ...S.input, width: '100%', height: 70, padding: 10, resize: 'vertical' }} placeholder="Details students should see…" value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Department</span>
            <select style={{ ...S.input, width: '100%' }} value={dept} disabled={!superAdmin} onChange={(e) => setDept(e.target.value)}>
              {superAdmin && <option value="">Whole campus</option>}
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
          <label><span style={S.label}>Visibility</span>
            <select style={{ ...S.input, width: '100%' }} value={visibility} onChange={(e) => setVisibility(e.target.value as TempKnowledge['visibility'])}>
              <option value="all">Everyone</option>
              <option value="students">Students only</option>
              <option value="admins">Admins only</option>
            </select>
          </label>
          <label><span style={S.label}>Priority (higher first)</span>
            <input style={{ ...S.input, width: '100%' }} type="number" min={0} max={99} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label><span style={S.label}>Starts</span>
            <input style={{ ...S.input, width: '100%' }} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label><span style={S.label}>Expires (required)</span>
            <input style={{ ...S.input, width: '100%' }} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Publishing…' : 'Publish'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
