// Admin panel shell — a proper SaaS dashboard, not one long page.
// Route: #/admin/<module>. Persistent left nav; each module owns its workflow.
// Dept Admins see only the modules that apply to them (RLS enforces the same
// boundary server-side — hiding nav items is UX, not security).
import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { brand } from '../../lib/brand'
import type { Department, Profile } from '../../lib/types'
import { isSuperAdmin } from '../../lib/types'
import { DashboardModule } from './DashboardModule'
import { StudentsModule } from './StudentsModule'
import { DocumentsModule } from './DocumentsModule'
import { TempKnowledgeModule } from './TempKnowledgeModule'
import { AdminsModule, AuditModule, DepartmentsModule, SystemModule } from './GovernanceModules'

// Heavy, pre-existing surfaces load on demand.
const AnalyticsDashboard = lazy(() => import('../AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard })))
const AdminImport = lazy(() => import('../AdminImport').then((m) => ({ default: m.AdminImport })))

type ModuleKey = 'dashboard' | 'students' | 'documents' | 'updates' | 'admins' | 'departments' | 'analytics' | 'system' | 'audit' | 'import'

const NAV: { key: ModuleKey; label: string; superOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'students', label: 'Students' },
  { key: 'documents', label: 'Documents' },
  { key: 'updates', label: 'Temporary updates' },
  { key: 'admins', label: 'Department Admins', superOnly: true },
  { key: 'departments', label: 'Departments', superOnly: true },
  { key: 'analytics', label: 'Analytics', superOnly: true },
  { key: 'system', label: 'System', superOnly: true },
  { key: 'audit', label: 'Audit logs' },
]

function routeFromHash(hash: string): ModuleKey {
  const m = hash.match(/^#\/admin\/?([a-z-]*)/)
  const key = (m?.[1] || 'dashboard') as ModuleKey
  return NAV.some((n) => n.key === key) || key === 'import' ? key : 'dashboard'
}

export function AdminPanel({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const superAdmin = isSuperAdmin(profile)
  const [route, setRoute] = useState<ModuleKey>(routeFromHash(window.location.hash))
  const [departments, setDepartments] = useState<Department[]>([])
  const [navOpen, setNavOpen] = useState(window.innerWidth > 900)

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function refreshDepartments() {
    try { setDepartments(await api.listDepartments()) } catch { /* ignore */ }
  }
  useEffect(() => { refreshDepartments() }, [])

  const fallback = <div style={{ padding: 40, color: 'var(--faint)' }}>Loading…</div>
  // Import lives under Students in the nav (computed before the early returns
  // below narrow `route` and confuse the comparison).
  const studentsActive = route === 'students' || route === 'import'

  // Full-screen reuse of the existing heavy surfaces.
  if (route === 'analytics' && superAdmin) {
    return <Suspense fallback={fallback}><AnalyticsDashboard onClose={() => { window.location.hash = '#/admin' }} /></Suspense>
  }
  if (route === 'import') {
    return <Suspense fallback={fallback}><AdminImport profile={profile} onClose={() => { window.location.hash = '#/admin/students' }} /></Suspense>
  }

  const visibleNav = NAV.filter((n) => !n.superOnly || superAdmin)

  return (
    <div style={{ height: '100dvh', display: 'flex', background: 'var(--paper-app)', overflow: 'hidden' }}>
      {/* Left nav */}
      <div style={{ width: navOpen ? 216 : 0, flex: 'none', overflow: 'hidden', transition: 'width .2s ease', borderRight: navOpen ? '1px solid var(--line)' : 'none', background: 'var(--paper-panel)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 14px 10px', fontWeight: 750, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          {brand.shortName ?? brand.name} · Admin
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {visibleNav.map((n) => {
            const active = route === n.key || (n.key === 'students' && studentsActive)
            return (
              <button key={n.key} onClick={() => { window.location.hash = `#/admin/${n.key}` }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', marginBottom: 2,
                  borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap',
                  fontWeight: active ? 700 : 500,
                  background: active ? 'var(--surface-soft)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                }}>
                {n.label}
              </button>
            )
          })}
        </nav>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ← Back to chat
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 50, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px solid var(--line)', background: 'var(--paper-panel)' }}>
          <button onClick={() => setNavOpen((v) => !v)} aria-label="Toggle navigation" className="mz-icon-btn" style={{ width: 36, height: 36 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h16" /><path d="M4 16h12" /></svg>
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>
            {superAdmin ? 'Super Admin' : 'Department Admin'}
          </span>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(14px, 3vw, 28px)' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            {route === 'dashboard' && <DashboardModule profile={profile} />}
            {route === 'students' && <StudentsModule profile={profile} departments={departments} />}
            {route === 'documents' && <DocumentsModule profile={profile} departments={departments} />}
            {route === 'updates' && <TempKnowledgeModule profile={profile} departments={departments} />}
            {route === 'admins' && superAdmin && <AdminsModule departments={departments} />}
            {route === 'departments' && superAdmin && <DepartmentsModule departments={departments} onChanged={refreshDepartments} />}
            {route === 'system' && superAdmin && <SystemModule />}
            {route === 'audit' && <AuditModule />}
          </div>
        </main>
      </div>
    </div>
  )
}
