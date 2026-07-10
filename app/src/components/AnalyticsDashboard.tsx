import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { Logo } from './Logo'
import type { AdminAnalytics, DailyPoint, HeatmapPoint, TopStudent } from '../lib/types'
import {
  BarChart as BarChartIcon, CalendarDays, Check, Clock, MessageCircle,
  Refresh, Sparkle, ThumbUp, TrendingDown, TrendingUp, Trophy, Users,
} from './Icons'

// Fixed hues for data-viz series — legitimate chart-color constants, kept
// separate from the themed CSS vars used for everything else (card chrome,
// text, borders) so the dashboard still themes correctly in light/dark.
const CHART = {
  purple: '#8b5cf6',
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f59e0b',
  teal: '#14b8a6',
  rose: '#f43f5e',
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function sum(ns: number[]): number { return ns.reduce((a, b) => a + b, 0) }

function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? 100 : null
  return Math.round(((cur - prev) / prev) * 100)
}

function fmtDateShort(d: string): string {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  catch { return d }
}
function fmtDateLong(d: string): string {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }
  catch { return d }
}
function hourLabel(hr: number): string {
  const h = hr % 12 === 0 ? 12 : hr % 12
  return `${h}${hr < 12 ? 'AM' : 'PM'}`
}
function dateRangeLabel(daily: DailyPoint[]): string {
  if (!daily.length) return 'Last 30 days'
  const start = new Date(`${daily[0].d}T00:00:00`)
  const end = new Date(`${daily[daily.length - 1].d}T00:00:00`)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

function computeInsights(data: AdminAnalytics): string[] {
  const out: string[] = []

  if (data.questions_prev_7d > 0) {
    const delta = Math.round(((data.questions_7d - data.questions_prev_7d) / data.questions_prev_7d) * 100)
    out.push(`Questions are ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}% vs last week (${data.questions_7d.toLocaleString()} vs ${data.questions_prev_7d.toLocaleString()}).`)
  }

  if (data.heatmap.length) {
    const byHour = new Map<number, number>()
    const byDow = new Map<number, number>()
    for (const p of data.heatmap) {
      byHour.set(p.hr, (byHour.get(p.hr) ?? 0) + p.n)
      byDow.set(p.dow, (byDow.get(p.dow) ?? 0) + p.n)
    }
    const peakHr = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]
    if (peakHr && peakHr[1] > 0) out.push(`Most active hour is ${hourLabel(peakHr[0])}.`)
    const peakDow = [...byDow.entries()].sort((a, b) => b[1] - a[1])[0]
    if (peakDow && peakDow[1] > 0) out.push(`${DOW_FULL[peakDow[0]]} is the busiest day of the week.`)
  }

  out.push(`${data.dau.toLocaleString()} students were active today · ${data.wau.toLocaleString()} this week.`)

  const rated = data.feedback_helpful + data.feedback_not_helpful
  if (rated > 0) {
    const score = Math.round((data.feedback_helpful / rated) * 100)
    out.push(`${score}% of rated answers were marked helpful, across ${rated} ratings.`)
  }

  if (data.new_students_7d > 0) out.push(`${data.new_students_7d} new student${data.new_students_7d === 1 ? '' : 's'} joined in the last 7 days.`)

  return out.slice(0, 5)
}

// Super Admin page: read-only business metrics (usage, engagement, feedback)
// backed by the `admin_analytics` Postgres RPC. No infra/server metrics here.
export function AnalyticsDashboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { load(true) }, [])

  async function load(initial = false) {
    if (initial) setLoading(true); else setRefreshing(true)
    setErr(null)
    try { setData(await api.adminAnalytics()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load analytics.') }
    finally { setLoading(false); setRefreshing(false) }
  }

  const insights = useMemo(() => (data ? computeInsights(data) : []), [data])
  const helpfulScore = useMemo(() => {
    if (!data) return null
    const rated = data.feedback_helpful + data.feedback_not_helpful
    return rated > 0 ? Math.round((data.feedback_helpful / rated) * 100) : null
  }, [data])
  const busy = loading || refreshing

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper-app)' }}>
      <header style={{ height: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
        <Logo size={26} /><span style={{ fontWeight: 600, fontSize: 15 }}>Merzal AI · Admin</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 9, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>← Back to chat</button>
      </header>

      <div style={{ maxWidth: 1220, margin: '0 auto', padding: '28px 20px 64px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 26 }}>
          <div>
            <h1 className="display" style={{ fontWeight: 400, fontSize: 27, margin: '0 0 6px' }}>Analytics</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Business metrics across usage, engagement, and student feedback.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', border: '1px solid var(--line-strong)', borderRadius: 999, padding: '7px 13px', background: 'var(--surface)', whiteSpace: 'nowrap' }}>
              <CalendarDays size={14} />{data ? dateRangeLabel(data.questions_daily) : 'Last 30 days'}
            </span>
            <button
              onClick={() => load(false)}
              disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              <Refresh size={14} style={{ animation: refreshing ? 'mz-spin 0.8s linear infinite' : undefined }} />
              Refresh
            </button>
          </div>
        </div>

        {err && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: 30, textAlign: 'center', color: 'var(--danger)', fontSize: 13.5 }}>
            {err}
          </div>
        )}

        {!err && loading && <p style={{ color: 'var(--faint)', fontSize: 13.5 }}>Loading…</p>}

        {!err && !loading && data && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <StatCard
                icon={<Users size={17} />} color={CHART.purple} label="Total students" value={data.total_students}
                footnote={data.new_students_7d > 0 ? `+${data.new_students_7d} this week` : undefined}
                spark={data.students_daily.map((p) => p.n)} sparkColor={CHART.purple}
              />
              <StatCard
                icon={<Check size={17} />} color={CHART.green} label="Active students" value={data.active_students}
                delta={{ pct: pctChange(data.active_students, data.active_prev_7d), label: 'vs last week' }}
                spark={data.students_daily.slice(-14).map((p) => p.n)} sparkColor={CHART.green}
              />
              <StatCard
                icon={<MessageCircle size={17} />} color={CHART.blue} label="AI conversations" value={data.total_chats}
              />
              <StatCard
                icon={<TrendingUp size={17} />} color={CHART.orange} label="Questions today" value={data.questions_today}
                delta={{ pct: pctChange(data.questions_today, data.questions_yesterday), label: 'vs yesterday' }}
                spark={data.questions_daily.slice(-14).map((p) => p.n)} sparkColor={CHART.orange}
              />
              <StatCard
                icon={<BarChartIcon size={17} />} color={CHART.teal} label="Total questions" value={data.total_questions}
                delta={{ pct: pctChange(data.questions_7d, data.questions_prev_7d), label: 'vs last 7d' }}
                spark={data.questions_daily.map((p) => p.n)} sparkColor={CHART.teal}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <ChartCard icon={<TrendingUp size={15} />} title="Questions over time" subtitle="Daily question volume · last 30 days" minWidth={460}>
                <AreaChart data={data.questions_daily} color={CHART.purple} />
              </ChartCard>
              <ChartCard title="Questions by mode" subtitle="Campus RAG vs. general world knowledge" minWidth={280}>
                <Donut
                  segments={[
                    { label: 'Campus', value: data.by_mode.campus ?? 0, color: CHART.blue },
                    { label: 'World', value: data.by_mode.world ?? 0, color: CHART.teal },
                  ]}
                />
              </ChartCard>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <ChartCard icon={<Users size={15} />} title="Student growth" subtitle="New students per day · last 30 days" minWidth={460}>
                <GrowthBarChart data={data.students_daily} color={CHART.green} />
              </ChartCard>
              <ChartCard icon={<ThumbUp size={15} />} title="Feedback summary" subtitle="Helpfulness of AI answers" minWidth={280}>
                <FeedbackSummary data={data} score={helpfulScore} />
              </ChartCard>
            </div>

            <div style={{ marginBottom: 14 }}>
              <ChartCard icon={<Clock size={15} />} title="Activity heatmap" subtitle="Questions by weekday × hour · last 30 days" minWidth={300}>
                <Heatmap data={data.heatmap} color={CHART.purple} />
              </ChartCard>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <ChartCard icon={<Trophy size={15} />} title="Top active students" subtitle="Most questions asked · all time" minWidth={360}>
                <TopStudentsList students={data.top_students} />
              </ChartCard>
              <ChartCard icon={<Sparkle size={15} />} title="AI insights" subtitle="Computed from the metrics above — nothing fabricated" minWidth={360}>
                {insights.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--faint)' }}>Not enough data yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {insights.map((line, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ color: CHART.purple, flex: 'none', marginTop: 2 }}><Sparkle size={14} /></span>
                        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-soft)' }}>{line}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Layout primitives ──────────────────────────────────────────────────

function ChartCard({ icon, title, subtitle, children, minWidth = 340 }: { icon?: ReactNode; title: string; subtitle?: string; children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ flex: `1 1 ${minWidth}px`, minWidth: 0, border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--shadow-pop)', padding: '20px 22px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        {icon && <span style={{ color: 'var(--faint)', display: 'inline-flex' }}>{icon}</span>}
        <div>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</h3>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--faint)' }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function StatCard({ icon, color, label, value, delta, footnote, spark, sparkColor }: {
  icon: ReactNode
  color: string
  label: string
  value: number
  delta?: { pct: number | null; label: string }
  footnote?: string
  spark?: number[]
  sparkColor?: string
}) {
  return (
    <div style={{ flex: '1 1 190px', minWidth: 0, border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--shadow-pop)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: `${color}1a`, color }}>{icon}</span>
        {delta && delta.pct !== null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, padding: '3px 7px', borderRadius: 999, background: delta.pct >= 0 ? 'rgba(34,197,94,0.13)' : 'rgba(244,63,94,0.13)', color: delta.pct >= 0 ? CHART.green : CHART.rose }}>
            {delta.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(delta.pct)}%
          </span>
        )}
      </div>
      <div>
        <p style={{ fontSize: 26, fontWeight: 650, margin: '0 0 2px', color: 'var(--ink)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</p>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          {label}{delta ? ` · ${delta.label}` : footnote ? ` · ${footnote}` : ''}
        </p>
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor ?? color} />}
    </div>
  )
}

function Sparkline({ values, color, height = 32 }: { values: number[]; color: string; height?: number }) {
  const W = 120
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const n = values.length
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Charts ───────────────────────────────────────────────────────────

function AreaChart({ data, color, height = 220 }: { data: DailyPoint[]; color: string; height?: number }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const padL = 4, padR = 4, padT = 14, padB = 24
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const n = data.length
  const maxV = Math.max(1, ...data.map((p) => p.n))
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => padT + plotH - (v / maxV) * plotH
  const line = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ')
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${padT + plotH} L${x(0).toFixed(1)},${padT + plotH} Z` : ''
  const tickIdx = n ? [...new Set([0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1])] : []

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!n) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let idx = Math.round(((px - padL) / plotW) * (n - 1))
    idx = Math.max(0, Math.min(n - 1, idx))
    setHover(idx)
  }

  const hp = hover !== null ? data[hover] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${height}`} width="100%" height={height}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: 'block', overflow: 'visible', cursor: n ? 'crosshair' : 'default' }}
      >
        <defs>
          <linearGradient id={`ac-${rawId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={padT + plotH * f} y2={padT + plotH * f} stroke="var(--line)" strokeWidth="1" />
        ))}
        {area && <path d={area} fill={`url(#ac-${rawId})`} stroke="none" />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />}
        {tickIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 6} fontSize="10.5" fill="var(--faint)" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {fmtDateShort(data[i].d)}
          </text>
        ))}
        {hover !== null && hp && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(hp.n)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover !== null && hp && (
        <div
          style={{
            position: 'absolute', top: 2, pointerEvents: 'none',
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover < n * 0.15 ? '0%' : hover > n * 0.85 ? '-100%' : '-50%'})`,
            background: 'var(--ink)', color: 'var(--paper)', fontSize: 11.5, padding: '5px 9px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-pop)',
          }}
        >
          <b>{hp.n.toLocaleString()}</b> questions · {fmtDateLong(hp.d)}
        </div>
      )}
    </div>
  )
}

function GrowthBarChart({ data, color, height = 190 }: { data: DailyPoint[]; color: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const padL = 4, padR = 4, padT = 10, padB = 24
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const n = data.length
  const maxV = Math.max(1, ...data.map((p) => p.n))
  const slot = plotW / Math.max(1, n)
  const gap = Math.min(3, slot * 0.25)
  const bw = Math.max(1, slot - gap)
  const xAt = (i: number) => padL + i * slot
  const barH = (v: number) => (v / maxV) * plotH
  const tickIdx = n ? [0, Math.round((n - 1) * 0.5), n - 1] : []

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        {data.map((p, i) => (
          <rect
            key={p.d}
            x={xAt(i) + gap / 2}
            y={padT + plotH - barH(p.n)}
            width={bw}
            height={Math.max(1, barH(p.n))}
            rx={Math.min(2.5, bw / 2)}
            fill={color}
            opacity={hover === null || hover === i ? 1 : 0.5}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {tickIdx.map((i) => (
          <text key={i} x={xAt(i) + bw / 2} y={height - 6} fontSize="10.5" fill="var(--faint)" textAnchor="middle">
            {fmtDateShort(data[i].d)}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute', top: 0, pointerEvents: 'none',
            left: `${((xAt(hover) + bw / 2) / W) * 100}%`, transform: 'translateX(-50%)',
            background: 'var(--ink)', color: 'var(--paper)', fontSize: 11.5, padding: '5px 9px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-pop)',
          }}
        >
          <b>{data[hover].n}</b> new · {fmtDateLong(data[hover].d)}
        </div>
      )}
    </div>
  )
}

function Heatmap({ data, color }: { data: HeatmapPoint[]; color: string }) {
  const [hover, setHover] = useState<{ dow: number; hr: number; n: number } | null>(null)
  const maxV = Math.max(1, ...data.map((p) => p.n))
  const byKey = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of data) m.set(`${p.dow}-${p.hr}`, p.n)
    return m
  }, [data])
  const peak = useMemo(() => data.reduce((a, b) => (b.n > a.n ? b : a), data[0] ?? { dow: 0, hr: 0, n: 0 }), [data])
  const shown = hover ?? peak

  const W = 760
  const labelW = 34
  const gridW = W - labelW
  const cell = gridW / 24
  const rowH = 20
  const gap = 2
  const H = rowH * 7 + 24

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
          <b style={{ color: 'var(--ink)' }}>{DOW_SHORT[shown.dow]} {hourLabel(shown.hr)}</b> · {shown.n} question{shown.n === 1 ? '' : 's'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>Less</span>
          {[0.12, 0.32, 0.52, 0.72, 0.95].map((o) => (
            <span key={o} style={{ width: 11, height: 11, borderRadius: 3, background: color, opacity: o }} />
          ))}
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>More</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
        {DOW_SHORT.map((lbl, dow) => (
          <text key={lbl} x={0} y={dow * rowH + rowH / 2 + 3.5} fontSize="10.5" fill="var(--faint)">{lbl}</text>
        ))}
        {Array.from({ length: 7 }).map((_, dow) =>
          Array.from({ length: 24 }).map((_, hr) => {
            const n = byKey.get(`${dow}-${hr}`) ?? 0
            const t = n / maxV
            return (
              <rect
                key={`${dow}-${hr}`}
                x={labelW + hr * cell + gap / 2}
                y={dow * rowH + gap / 2}
                width={Math.max(1, cell - gap)}
                height={rowH - gap}
                rx={2.5}
                fill={color}
                opacity={n === 0 ? 0.06 : 0.14 + t * 0.82}
                onMouseEnter={() => setHover({ dow, hr, n })}
              />
            )
          }),
        )}
        {[0, 6, 12, 18, 23].map((hr) => (
          <text key={hr} x={labelW + hr * cell + cell / 2} y={7 * rowH + 17} fontSize="10.5" fill="var(--faint)" textAnchor="middle">
            {hourLabel(hr)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function Donut({ segments, size = 168 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = Math.max(1, sum(segments.map((s) => s.value)))
  const r = size / 2 - 15
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
        {segments.map((s) => {
          const frac = s.value / total
          const dash = frac * c
          const el = (
            <circle
              key={s.label}
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += dash
          return el
        })}
        <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize="21" fontWeight="650" fill="var(--ink)">{total.toLocaleString()}</text>
        <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="10.5" fill="var(--faint)">questions</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: '1 1 120px', minWidth: 0 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />
            <span style={{ color: 'var(--ink-soft)' }}>{s.label}</span>
            <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Gauge({ score, size = 176 }: { score: number; size?: number }) {
  const h = Math.round(size * 0.58)
  const r = size / 2 - 16
  const cx = size / 2
  const cy = h - 14
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const color = score >= 80 ? CHART.green : score >= 55 ? CHART.orange : CHART.rose
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
      <path d={path} fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" pathLength={100} />
      <path d={path} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" pathLength={100} strokeDasharray={`${score} 100`} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--ink)">{score}%</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="11" fill="var(--faint)">helpful</text>
    </svg>
  )
}

function FeedbackSummary({ data, score }: { data: AdminAnalytics; score: number | null }) {
  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Helpful', value: data.feedback_helpful, color: CHART.green },
    { label: 'Not helpful', value: data.feedback_not_helpful, color: CHART.rose },
    { label: 'Bug reports', value: data.feedback_bugs, color: CHART.orange },
    { label: 'Feature requests', value: data.feedback_features, color: CHART.blue },
    { label: 'Open items', value: data.feedback_open, color: CHART.purple },
  ]
  const max = Math.max(1, ...rows.map((r) => r.value))
  const rated = data.feedback_helpful + data.feedback_not_helpful

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
        {score === null ? (
          <div style={{ width: 176, height: 102, display: 'grid', placeItems: 'center', color: 'var(--faint)', fontSize: 12.5 }}>No ratings yet</div>
        ) : (
          <>
            <Gauge score={score} />
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--faint)' }}>{rated.toLocaleString()} rating{rated === 1 ? '' : 's'}</p>
          </>
        )}
      </div>
      <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: 'var(--ink-soft)' }}>{r.label}</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>{r.value.toLocaleString()}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-soft)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(r.value / max) * 100}%`, borderRadius: 999, background: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopStudentsList({ students }: { students: TopStudent[] }) {
  if (!students.length) return <p style={{ margin: 0, fontSize: 13, color: 'var(--faint)' }}>No activity yet.</p>
  const max = Math.max(1, ...students.map((s) => s.n))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {students.map((s, i) => (
        <div key={s.register ?? s.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ width: 18, flex: 'none', fontSize: 12.5, color: 'var(--faint)' }}>{String(i + 1).padStart(2, '0')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--faint)', flex: 'none' }}>{s.register ?? '—'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-soft)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(s.n / max) * 100}%`, borderRadius: 999, background: CHART.purple, opacity: 1 - i * 0.11 }} />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 'none', width: 32, textAlign: 'right' }}>{s.n}</span>
        </div>
      ))}
    </div>
  )
}
