export type Role = 'user' | 'assistant'
export type ChatMode = 'campus' | 'world'
export type Reaction = 'up' | 'down' | null

export interface Profile {
  id: string
  college_id: string
  department: string | null
  department_id?: string | null
  semester: number | null
  role: string
  onboarding_done: boolean
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
// `admin_analytics` RPC (admin-gated server-side). All values are integers.
export type AdminAnalytics = Record<string, number>
