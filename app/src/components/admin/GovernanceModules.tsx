// Governance modules: Departments (Super Admin), Department Admins (Super
// Admin), Audit Logs, and System. Small surfaces — grouped in one file.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { brand } from '../../lib/brand'
import type { AdminUser, Department } from '../../lib/types'
import { adminApi, type AuditRow } from '../../lib/admin'
import { Badge, Btn, Card, Empty, Modal, Notice, PageHead, S, Th } from './ui'

// ── DEPARTMENTS ────────────────────────────────────────────────────────────
export function DepartmentsModule({ departments, onChanged }: { departments: Department[]; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<Department | null>(null)

  async function add() {
    setErr(null)
    if (!name.trim()) { setErr('Department name is required.'); return }
    try { await api.createDepartment(name, code); setName(''); setCode(''); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not create department.') }
  }

  return (
    <div>
      <PageHead title="Departments" sub={`${departments.length} of ~20 expected at full scale`} />
      {err && <Notice tone="err" text={err} />}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...S.input, flex: '2 1 220px' }} placeholder="Computer Science & Engineering" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={{ ...S.input, flex: '1 1 90px' }} placeholder="CSE" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
          <Btn kind="primary" onClick={add}>+ Add department</Btn>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Code</Th><Th>Name</Th><Th></Th></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td style={{ ...S.td, fontWeight: 700 }}>{d.code ?? '—'}</td>
                <td style={S.td}>{d.name}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <Btn small kind="danger" onClick={() => setConfirmDel(d)}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!departments.length && <Empty text="No departments yet." />}
      </Card>
      {confirmDel && (
        <Modal title={`Delete ${confirmDel.code ?? confirmDel.name}?`} onClose={() => setConfirmDel(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 0 }}>
            Students and documents keep existing but lose this department scope. This cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn onClick={() => setConfirmDel(null)}>Cancel</Btn>
            <Btn kind="danger" onClick={async () => {
              try { await api.deleteDepartment(confirmDel.id); setConfirmDel(null); onChanged() }
              catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.'); setConfirmDel(null) }
            }}>Delete department</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── DEPARTMENT ADMINS ──────────────────────────────────────────────────────
export function AdminsModule({ departments }: { departments: Department[] }) {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [reg, setReg] = useState('')
  const [dept, setDept] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function refresh() { try { setAdmins(await api.listAdmins()) } catch { /* ignore */ } }
  useEffect(() => { refresh() }, [])

  async function promote() {
    setErr(null); setOk(null)
    try {
      await adminApi.promoteAdmin(reg.trim(), dept || null)
      setOk(dept ? 'Promoted to Department Admin.' : 'Promoted to Super Admin.')
      setReg(''); setDept(''); refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not promote.') }
  }

  return (
    <div>
      <PageHead title="Department Admins" sub="HODs manage only their own department. Promotion requires the person to have signed in once." />
      {err && <Notice tone="err" text={err} />}
      {ok && <Notice tone="ok" text={ok} />}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...S.input, flex: '1 1 180px' }} placeholder="Register number" value={reg} onChange={(e) => setReg(e.target.value)} />
          <select style={{ ...S.input, flex: '1 1 180px' }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Super Admin (all departments)</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <Btn kind="primary" onClick={promote} disabled={!reg.trim()}>Promote</Btn>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Name</Th><Th>Register</Th><Th>Scope</Th><Th></Th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.user_id}>
                <td style={S.td}>{a.name}</td>
                <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{a.register_number ?? '—'}</td>
                <td style={S.td}>{a.is_super ? <Badge tone="ok">Super Admin</Badge> : <Badge tone="info">{a.department_name ?? 'Department'}</Badge>}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <Btn small kind="danger" onClick={async () => {
                    try { await adminApi.demoteAdmin(a.user_id); refresh() }
                    catch (e) { setErr(e instanceof Error ? e.message : 'Could not demote.') }
                  }}>Demote</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!admins.length && <Empty text="No admins found." />}
      </Card>
    </div>
  )
}

// ── AUDIT LOGS ─────────────────────────────────────────────────────────────
export function AuditModule() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    adminApi.listAudit(200).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the audit log.'))
  }, [])

  return (
    <div>
      <PageHead title="Audit logs" sub="Every privileged action: who, what, whom, when. Insert-only." />
      {err && <Notice tone="err" text={err} />}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>When</Th><Th>Action</Th><Th>Target</Th><Th>Detail</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...S.td, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{new Date(r.ts).toLocaleString()}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.action}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.target ?? '—'}</td>
                  <td style={{ ...S.td, color: 'var(--muted)', fontSize: 12.5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.detail && Object.keys(r.detail).length ? JSON.stringify(r.detail) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text="Nothing here yet — privileged actions will appear as they happen." />}
      </Card>
    </div>
  )
}

// ── SYSTEM ─────────────────────────────────────────────────────────────────
export function SystemModule() {
  const info: [string, string][] = [
    ['Tenant', brand.name],
    ['Frontend', 'React + Vite SPA (PWA)'],
    ['Backend', 'Supabase — Postgres + RLS, GoTrue auth, Deno edge functions'],
    ['Permanent knowledge', 'PageIndex (tree-search retrieval; content indexed per document)'],
    ['Temporary knowledge', 'Postgres prompt layer — no indexing, expires automatically'],
    ['LLM chain', 'DeepSeek V4 Flash → Gemma 4 → Gemini Flash (server-side keys)'],
    ['Design doc', 'docs/ADMIN_SYSTEM_DESIGN.md'],
  ]
  return (
    <div>
      <PageHead title="System" sub="Deployment reference for this tenant" />
      <Card style={{ padding: 0 }}>
        {info.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 14, padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
            <span style={{ width: 170, flex: 'none', color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
            <span style={{ color: 'var(--ink)' }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
