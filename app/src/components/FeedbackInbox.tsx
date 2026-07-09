import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { Logo } from './Logo'
import type { Feedback, FeedbackStatus, FeedbackType } from '../lib/types'
import { Bug, Lightbulb, Pencil, ThumbDown, ThumbUp } from './Icons'

const TYPE_META: Record<FeedbackType, { icon: ReactNode; label: string }> = {
  helpful: { icon: <ThumbUp size={14} />, label: 'Helpful' },
  not_helpful: { icon: <ThumbDown size={14} />, label: 'Not helpful' },
  bug: { icon: <Bug size={14} />, label: 'Bug' },
  feature: { icon: <Lightbulb size={14} />, label: 'Feature' },
  general: { icon: <Pencil size={14} />, label: 'General' },
}

const STATUS_META: Record<FeedbackStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

const STATUS_FILTERS: ('all' | FeedbackStatus)[] = ['all', 'open', 'in_progress', 'resolved']
const TYPE_FILTERS: ('all' | FeedbackType)[] = ['all', 'helpful', 'not_helpful', 'bug', 'feature', 'general']

// Super Admin page: every student feedback submission (thumbs + standalone
// bug/feature/general notes), newest first, with a status the admin can move
// Open → In Progress → Resolved.
export function FeedbackInbox({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackType>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setErr(null)
    try { setItems(await api.listFeedback()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load feedback.') }
    finally { setLoading(false) }
  }

  async function setStatus(id: string, status: FeedbackStatus) {
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)))
    try { await api.updateFeedbackStatus(id, status) }
    catch { await load() } // roll back to server state on failure
  }

  const filtered = useMemo(
    () => items.filter((f) => (statusFilter === 'all' || f.status === statusFilter) && (typeFilter === 'all' || f.type === typeFilter)),
    [items, statusFilter, typeFilter],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const f of items) c[f.status] = (c[f.status] ?? 0) + 1
    return c
  }, [items])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} /><span style={{ fontWeight: 600, fontSize: 15 }}>Merzal AI · Admin</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 9, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>← Back to chat</button>
      </header>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 60px' }}>
        <h1 className="display" style={{ fontWeight: 400, fontSize: 26, margin: '0 0 6px' }}>Feedback inbox</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>Every reaction, bug report, feature request, and general note students send — triage below.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <FilterGroup label="Status">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : STATUS_META[s]}{typeof counts[s] === 'number' ? ` (${counts[s]})` : ''}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Type">
            {TYPE_FILTERS.map((t) => (
              <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t === 'all' ? 'All' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{TYPE_META[t].icon}{TYPE_META[t].label}</span>
                )}
              </FilterChip>
            ))}
          </FilterGroup>
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{err}</p>}

        {loading ? (
          <p style={{ color: 'var(--faint)', fontSize: 13.5 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: 28, textAlign: 'center', color: 'var(--faint)', fontSize: 13.5 }}>
            {items.length === 0 ? 'No feedback yet.' : 'No feedback matches these filters.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((f) => <FeedbackRow key={f.id} f={f} onStatus={(s) => setStatus(f.id, s)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--faint)', margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12.5, border: '1px solid var(--line-strong)', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--ink-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  )
}

function FeedbackRow({ f, onStatus }: { f: Feedback; onStatus: (s: FeedbackStatus) => void }) {
  const [expanded, setExpanded] = useState(false)
  const meta = TYPE_META[f.type]
  const primaryText = f.student_message || f.comment
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--surface-soft)', color: 'var(--ink)' }}>
          {meta.icon} {meta.label}
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{f.register_number ?? '—'}</span>
        <span style={{ fontSize: 12, color: 'var(--faint)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.department ?? '—'}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{formatTimestamp(f.created_at)}</span>
      </div>

      {primaryText && <p style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{primaryText}</p>}
      {f.student_message && f.comment && (
        <p style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}><b>Comment:</b> {f.comment}</p>
      )}
      {!primaryText && !f.comment && <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--faint)' }}>No message.</p>}

      {f.ai_response && (
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setExpanded((v) => !v)} style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            {expanded ? '▾ Hide AI response' : '▸ Show AI response'}
          </button>
          {expanded && (
            <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper-app)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>
              {f.ai_response}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {(['open', 'in_progress', 'resolved'] as FeedbackStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => onStatus(s)}
            style={{ height: 28, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1px solid var(--line-strong)', background: f.status === s ? 'var(--ink)' : 'var(--paper-app)', color: f.status === s ? 'var(--paper)' : 'var(--ink-soft)', cursor: 'pointer' }}
          >
            {STATUS_META[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}
