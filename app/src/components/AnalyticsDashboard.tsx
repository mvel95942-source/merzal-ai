import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Logo } from './Logo'
import type { AdminAnalytics } from '../lib/types'

type Metric = { key: string; label: string }

const USAGE: Metric[] = [
  { key: 'total_students', label: 'Total students' },
  { key: 'active_students', label: 'Active students' },
  { key: 'total_chats', label: 'Total conversations' },
  { key: 'total_questions', label: 'Total questions' },
  { key: 'questions_today', label: 'Questions today' },
]

const ENGAGEMENT: Metric[] = [
  { key: 'dau', label: 'Daily active users' },
  { key: 'wau', label: 'Weekly active users' },
  { key: 'mau', label: 'Monthly active users' },
  { key: 'new_students_7d', label: 'New students (7d)' },
  { key: 'new_students_30d', label: 'New students (30d)' },
]

const FEEDBACK: Metric[] = [
  { key: 'feedback_helpful', label: 'Helpful' },
  { key: 'feedback_not_helpful', label: 'Not helpful' },
  { key: 'feedback_open', label: 'Open items' },
  { key: 'feedback_bugs', label: 'Bug reports' },
  { key: 'feedback_features', label: 'Feature requests' },
]

// Super Admin page: read-only business metrics (usage, engagement, feedback)
// backed by the `admin_analytics` Postgres RPC. No infra/server metrics here.
export function AnalyticsDashboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setErr(null)
    try { setData(await api.adminAnalytics()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load analytics.') }
    finally { setLoading(false) }
  }

  const helpful = data?.feedback_helpful ?? 0
  const notHelpful = data?.feedback_not_helpful ?? 0
  const totalRated = helpful + notHelpful
  const helpfulScore = totalRated > 0 ? Math.round((helpful / totalRated) * 100) : null

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} /><span style={{ fontWeight: 600, fontSize: 15 }}>Merzal AI · Admin</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 9, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>← Back to chat</button>
      </header>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 60px' }}>
        <h1 className="display" style={{ fontWeight: 400, fontSize: 26, margin: '0 0 6px' }}>Analytics</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 24px' }}>Business metrics across usage, engagement, and student feedback.</p>

        {err && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: 28, textAlign: 'center', color: 'var(--danger)', fontSize: 13.5 }}>
            {err}
          </div>
        )}

        {!err && loading && (
          <p style={{ color: 'var(--faint)', fontSize: 13.5 }}>Loading…</p>
        )}

        {!err && !loading && data && (
          <>
            <MetricSection title="Usage">
              {USAGE.map((m) => <MetricCard key={m.key} label={m.label} value={data[m.key] ?? 0} />)}
            </MetricSection>

            <MetricSection title="Engagement">
              {ENGAGEMENT.map((m) => <MetricCard key={m.key} label={m.label} value={data[m.key] ?? 0} />)}
            </MetricSection>

            <MetricSection title="Feedback">
              <MetricCard label="Helpfulness score" value={helpfulScore === null ? '—' : `${helpfulScore}%`} accent />
              {FEEDBACK.map((m) => <MetricCard key={m.key} label={m.label} value={data[m.key] ?? 0} />)}
            </MetricSection>
          </>
        )}
      </div>
    </div>
  )
}

function MetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', margin: '0 0 10px' }}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  const display = typeof value === 'number' ? value.toLocaleString() : value
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', boxShadow: 'var(--shadow-pop)', padding: '18px 18px 16px' }}>
      <p style={{ fontSize: 28, fontWeight: 600, margin: '0 0 4px', color: accent ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.02em' }}>{display}</p>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>{label}</p>
    </div>
  )
}
