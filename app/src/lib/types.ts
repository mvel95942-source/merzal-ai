export type Role = 'user' | 'assistant'
export type ChatMode = 'campus' | 'world'
export type Reaction = 'up' | 'down' | null

export interface Profile {
  id: string
  college_id: string
  department: string | null
  department_id?: string | null
  semester: number | null
  section?: string | null
  role: string
  onboarding_done: boolean
  /** Set by an admin password reset; the app forces a new password before chat. */
  must_change_password?: boolean
  disabled?: boolean
}

// RBAC helpers. Two admin tiers, distinguished by department_id:
// - Super Admin: role==='admin' AND department_id is null → full access.
// - Department Admin: role==='admin' AND department_id is set → scoped to
//   their own department's students only (RLS enforces this server-side).
export function isAdmin(p: Profile | null): boolean {
  return p?.role === 'admin'
}
export function isSuperAdmin(p: Profile | null): boolean {
  return p?.role === 'admin' && !p.department_id
}
export function isDeptAdmin(p: Profile | null): boolean {
  return p?.role === 'admin' && !!p.department_id
}

// College → Department → Year → Students. No classes/sections.
export interface Department {
  id: string
  name: string
  code: string | null
}

// Row shape for the Admins panel: an admin profile denormalized with the
// student's name/register-number (their own roster entry) and department name.
export interface AdminUser {
  user_id: string
  name: string
  register_number: string | null
  department_id: string | null
  department_name: string | null
  is_super: boolean
}

export interface Chat {
  id: string
  title: string
  bucket: string
  pinned: boolean
  updated_at: string
}

export interface Message {
  id: string
  chat_id: string
  role: Role
  content: string
  mode?: ChatMode | null
  reaction?: Reaction
  created_at: string
  /**
   * Every generated version of an assistant answer, oldest first, INCLUDING the
   * one currently in `content`. Null/absent on user messages and on any reply
   * that was never regenerated — those show no version arrows.
   * `content` is always kept in sync with `variants[variant_index]` so every
   * other read path (exports, shared chats, the model's own history) keeps
   * working without knowing variants exist.
   */
  variants?: string[] | null
  variant_index?: number | null
}

/** Version-arrow state for an assistant reply. Single source of truth for the UI. */
export function versionsOf(m: Message): { list: string[]; index: number; count: number } {
  const list = m.variants?.length ? m.variants : [m.content]
  const raw = m.variant_index ?? list.length - 1
  const index = Math.min(Math.max(raw, 0), list.length - 1)
  return { list, index, count: list.length }
}

/**
 * How many times one reply may be regenerated. Three retries is plenty to get
 * past a bad answer; past that it is nearly always the question that needs
 * rewording, not another roll of the dice. Each regeneration is a full model
 * call, so the cap also bounds cost and the row's stored history.
 *
 * Not enforced in the database on purpose: a CHECK on jsonb_array_length would
 * make the whole UPDATE fail once reached, leaving stored `content` out of sync
 * with the answer on screen. The UI is the gate.
 */
export const MAX_REGENERATIONS = 3

/** Versions = 1 original + up to MAX_REGENERATIONS regenerated. */
export function regenerationsLeft(m: Message): number {
  return Math.max(0, MAX_REGENERATIONS - (versionsOf(m).count - 1))
}

export interface MemoryItem {
  id: string
  fact: string
}

export type ConnState = 'live' | 'slow' | 'offline'

// Student → Super Admin feedback inbox. One row per submission (thumbs on an
// AI reply, or a standalone bug/feature/general note from Settings).
export type FeedbackType = 'helpful' | 'not_helpful' | 'bug' | 'feature' | 'general'
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved'

export interface Feedback {
  id: string
  user_id: string
  register_number: string | null
  department: string | null
  chat_id: string | null
  message_id: string | null
  type: FeedbackType
  student_message: string | null
  ai_response: string | null
  comment: string | null
  status: FeedbackStatus
  created_at: string
}

// Super Admin analytics dashboard: business metrics returned by the
// `admin_analytics` RPC (admin-gated server-side).
export interface DailyPoint { d: string; n: number }
export interface HeatmapPoint { dow: number; hr: number; n: number }
export interface TopStudent { name: string; register: string | null; n: number }

export interface AdminAnalytics {
  total_students: number
  active_students: number
  total_departments: number
  total_chats: number
  total_questions: number
  questions_today: number
  questions_yesterday: number
  questions_7d: number
  questions_prev_7d: number
  dau: number
  wau: number
  mau: number
  active_prev_7d: number
  new_students_7d: number
  new_students_30d: number
  feedback_total: number
  feedback_helpful: number
  feedback_not_helpful: number
  feedback_bugs: number
  feedback_features: number
  feedback_open: number
  // Last 30 days, oldest first.
  questions_daily: DailyPoint[]
  students_daily: DailyPoint[]
  // Weekday (0=Sun..6=Sat) × hour-of-day (0-23) activity counts, last 30 days.
  heatmap: HeatmapPoint[]
  top_students: TopStudent[]
  by_mode: { campus: number; world: number }
}
