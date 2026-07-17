// Dashboard — landing module: live counts, quick actions, recent admin activity.
import { useEffect, useState } from 'react'
import type { Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { adminApi, type AuditRow } from '../../lib/admin'
import { Btn, Card, Empty, PageHead } from './ui'

export function DashboardModule({ profile }: { profile: Profile | null }) {
  const [counts, setCounts] = useState<{ students: number; departments: number; docs: number; updates: number } | null>(null)
  const [recent, setRecent] = useState<AuditRow[]>([])

  useEffect(() => {
    adminApi.dashboardCounts().then(setCounts).catch(() => {})
    adminApi.listAudit(8).then(setRecent).catch(() => {})
  }, [])

  const tiles = [
    { label: 'Students', value: counts?.students, hash: '#/admin/students' },
    { label: 'Departments', value: counts?.departments, hash: '#/admin/departments' },
    { label: 'Documents', value: counts?.docs, hash: '#/admin/documents' },
    { label: 'Live updates', value: counts?.updates, hash: '#/admin/updates' },
  ]

  return (
    <div>
      <PageHead title="Dashboard" sub={isSuperAdmin(profile) ? 'Super Admin — whole campus' : 'Department Admin — your department'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {tiles.map((t) => (
          <Card key={t.label} style={{ cursor: 'pointer' }}>
            <div onClick={() => { window.location.hash = t.hash }}>
              <div style={{ fontSize: 26, fontWeight: 750, color: 'var(--ink)' }}>{t.value?.toLocaleString() ?? '—'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{t.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Btn kind="primary" onClick={() => { window.location.hash = '#/admin/updates' }}>+ Post an update</Btn>
        <Btn onClick={() => { window.location.hash = '#/admin/students' }}>Find a student</Btn>
        <Btn onClick={() => { window.location.hash = '#/admin/import' }}>⇪ Import roster</Btn>
        <Btn onClick={() => { window.location.hash = '#/admin/documents' }}>⇪ Upload document</Btn>
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>Recent admin activity</div>
        {recent.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{new Date(r.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.action}</span>
            <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.target ?? ''}</span>
          </div>
        ))}
        {!recent.length && <Empty text="No admin activity recorded yet." />}
      </Card>
    </div>
  )
}
