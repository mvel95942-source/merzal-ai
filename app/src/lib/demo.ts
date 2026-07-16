// Preview / demo mode — a localStorage-backed mirror of the `api` surface so the
// whole web app is usable WITHOUT Supabase auth (which needs dashboard config).
// Enabled by the "Explore preview" button on the login screen. Data lives only
// in this browser. Real auth + Supabase take over once `demo` is off.
import type { AdminAnalytics, AdminUser, Chat, DailyPoint, Department, Feedback, FeedbackStatus, FeedbackType, HeatmapPoint, MemoryItem, Message, Profile, Reaction, TopStudent } from './types'

const FLAG = 'merzal_demo'
export const isDemo = () => localStorage.getItem(FLAG) === '1'
export function enterDemo() { localStorage.setItem(FLAG, '1') }
export function exitDemo() {
  localStorage.removeItem(FLAG)
  for (const k of Object.keys(localStorage)) if (k.startsWith('merzal_demo_')) localStorage.removeItem(k)
}

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write<T>(key: string, val: T) { localStorage.setItem(key, JSON.stringify(val)) }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2))
const now = () => new Date().toISOString()

const CHATS = 'merzal_demo_chats'
const MSGS = (id: string) => `merzal_demo_msgs_${id}`
const PROFILE = 'merzal_demo_profile'
const MEMORY = 'merzal_demo_memory'
const FEEDBACK = 'merzal_demo_feedback'
const DEPARTMENTS = 'merzal_demo_departments'
const ADMINS = 'merzal_demo_admins'
const STUDENTS = 'merzal_demo_students'

// College → Department → Year → Students. Six seeded departments, matching
// the real backend seed, so the preview shows the same shape.
const DEPARTMENTS_SEED: Department[] = [
  { id: 'dept-aids', name: 'Artificial Intelligence & Data Science', code: 'AIDS' },
  { id: 'dept-civil', name: 'Civil Engineering', code: 'CIVIL' },
  { id: 'dept-cse', name: 'Computer Science & Engineering', code: 'CSE' },
  { id: 'dept-ece', name: 'Electronics & Communication Engineering', code: 'ECE' },
  { id: 'dept-it', name: 'Information Technology', code: 'IT' },
  { id: 'dept-mech', name: 'Mechanical Engineering', code: 'MECH' },
]

const ADMINS_SEED: AdminUser[] = [
  { user_id: 'demo-user', name: 'You (preview)', register_number: 'demo-admin', department_id: null, department_name: null, is_super: true },
  { user_id: 'demo-dept-admin-1', name: 'Priya Rao', register_number: '21CS042', department_id: 'dept-cse', department_name: 'Computer Science & Engineering', is_super: false },
]

type DemoStudent = { id: string; name: string; mobile: string; status: string; department_id: string | null; year: number | null }
const STUDENTS_SEED: DemoStudent[] = [
  { id: 'stu-1', name: 'Ananya Iyer', mobile: '21CS001', status: 'active', department_id: 'dept-cse', year: 3 },
  { id: 'stu-2', name: 'Rahul Nair', mobile: '21IT014', status: 'active', department_id: 'dept-it', year: 2 },
  { id: 'stu-3', name: 'Priya Rao', mobile: '21CS042', status: 'active', department_id: 'dept-cse', year: 4 },
  { id: 'stu-4', name: 'Karthik S', mobile: '21EC009', status: 'pending_profile', department_id: 'dept-ece', year: 1 },
]

// ── Analytics preview data ──────────────────────────────────────────
// Deterministic pseudo-random generator (mulberry32) so the demo charts look
// realistic but stay stable across "Refresh" clicks and re-renders.
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function lastNDays(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
function sum(ns: number[]): number { return ns.reduce((a, b) => a + b, 0) }

function genQuestionsDaily(): DailyPoint[] {
  const rnd = mulberry32(42)
  return lastNDays(30).map((d, i) => {
    const dow = new Date(d + 'T00:00:00').getDay()
    const weekend = dow === 0 || dow === 6
    const trend = 16 + i * 0.55
    const noise = (rnd() - 0.5) * 9
    const n = Math.max(2, Math.round(trend + noise + (weekend ? -7 : 0)))
    return { d, n }
  })
}
function genStudentsDaily(): DailyPoint[] {
  const rnd = mulberry32(99)
  return lastNDays(30).map((d) => {
    const spike = rnd() > 0.88 ? Math.round(rnd() * 4) : 0
    const n = Math.max(0, Math.round(rnd() * 1.6) + spike)
    return { d, n }
  })
}
function genHeatmap(): HeatmapPoint[] {
  const rnd = mulberry32(7)
  const out: HeatmapPoint[] = []
  for (let dow = 0; dow < 7; dow++) {
    const weekend = dow === 0 || dow === 6
    for (let hr = 0; hr < 24; hr++) {
      let base = 0
      if (hr >= 8 && hr <= 22) base = 4 + Math.sin(((hr - 8) / 14) * Math.PI) * 11
      if (hr >= 19 && hr <= 22) base += 6
      if (weekend) base *= 0.55
      out.push({ dow, hr, n: Math.max(0, Math.round(base + rnd() * 4)) })
    }
  }
  return out
}

const QUESTIONS_DAILY = genQuestionsDaily()
const STUDENTS_DAILY = genStudentsDaily()
const HEATMAP = genHeatmap()
const TOP_STUDENTS: TopStudent[] = [
  { name: 'Ananya Iyer', register: '21CS001', n: 142 },
  { name: 'Priya Rao', register: '21CS042', n: 118 },
  { name: 'Rahul Nair', register: '21IT014', n: 97 },
  { name: 'Karthik S', register: '21EC009', n: 81 },
  { name: 'Meera Pillai', register: '21ME027', n: 63 },
  { name: 'Arjun Kumar', register: '21CV011', n: 54 },
]

export const demoApi = {
  getSession: async () => ({ user: { id: 'demo-user', email: 'you@preview.merzal' } }),
  signOut: async () => exitDemo(),

  // Defaults to a Super Admin profile (department_id null) so the preview
  // shows the full app, including admin-only routes, with no sign-in needed.
  getProfile: async (): Promise<Profile | null> => {
    const cur = read<Profile | null>(PROFILE, null)
    if (cur) return cur
    return { id: 'demo-user', college_id: 'demo', department: null, department_id: null, semester: null, role: 'admin', onboarding_done: true }
  },
  upsertProfile: async (p: Partial<Profile>) => {
    const cur = read<Profile | null>(PROFILE, null)
    write(PROFILE, { id: 'demo-user', college_id: 'demo', department: null, department_id: null, role: 'admin', onboarding_done: true, ...cur, ...p })
  },

  listChats: async (): Promise<Chat[]> =>
    read<Chat[]>(CHATS, []).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)),
  createChat: async (title = 'New chat', bucket = 'Today'): Promise<Chat> => {
    const c: Chat = { id: uuid(), title, bucket, pinned: false, updated_at: now() }
    write(CHATS, [c, ...read<Chat[]>(CHATS, [])])
    return c
  },
  renameChat: async (id: string, title: string) => mutateChat(id, (c) => ({ ...c, title, updated_at: now() })),
  pinChat: async (id: string, pinned: boolean) => mutateChat(id, (c) => ({ ...c, pinned })),
  touchChat: async (id: string) => mutateChat(id, (c) => ({ ...c, updated_at: now() })),
  deleteChat: async (id: string) => {
    write(CHATS, read<Chat[]>(CHATS, []).filter((c) => c.id !== id))
    localStorage.removeItem(MSGS(id))
  },

  listMessages: async (chatId: string): Promise<Message[]> => read<Message[]>(MSGS(chatId), []),
  addMessage: async (m: { chat_id: string; role: 'user' | 'assistant'; content: string; mode?: 'campus' | 'world' }): Promise<Message> => {
    const msg = { id: uuid(), user_id: 'demo-user', created_at: now(), reaction: null, ...m } as Message
    write(MSGS(m.chat_id), [...read<Message[]>(MSGS(m.chat_id), []), msg])
    return msg
  },
  editMessage: async (id: string, content: string) => mutateMsg(id, (m) => ({ ...m, content })),
  // Mirrors realApi.saveVariants: content always tracks the active variant.
  // Preview has no Postgres, so history just lives in localStorage — always
  // "persisted" from the caller's point of view.
  saveVariants: async (id: string, variants: string[], index: number) => {
    mutateMsg(id, (m) => ({ ...m, content: variants[index], variants, variant_index: index }))
    return { persisted: true }
  },
  reactMessage: async (id: string, reaction: Reaction) => mutateMsg(id, (m) => ({ ...m, reaction })),
  deleteMessage: async (id: string) => {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('merzal_demo_msgs_')) continue
      const list = read<Message[]>(k, [])
      if (list.some((m) => m.id === id)) write(k, list.filter((m) => m.id !== id))
    }
  },
  submitFeedback: async (f: {
    chat_id?: string
    message_id?: string
    type: FeedbackType
    comment?: string
    student_message?: string
    ai_response?: string
  }) => {
    const key = FEEDBACK
    const row: Feedback = {
      id: uuid(),
      user_id: 'demo-user',
      register_number: 'demo-user',
      department: read<Profile | null>(PROFILE, null)?.department ?? null,
      chat_id: f.chat_id ?? null,
      message_id: f.message_id ?? null,
      type: f.type,
      student_message: f.student_message ?? null,
      ai_response: f.ai_response ?? null,
      comment: f.comment ?? null,
      status: 'open',
      created_at: now(),
    }
    write(key, [row, ...read<Feedback[]>(key, [])])
  },
  listFeedback: async (): Promise<Feedback[]> => read<Feedback[]>(FEEDBACK, []),
  updateFeedbackStatus: async (id: string, status: FeedbackStatus) => {
    write(FEEDBACK, read<Feedback[]>(FEEDBACK, []).map((f) => (f.id === id ? { ...f, status } : f)))
  },
  shareChat: async (chatId: string) => {
    const token = uuid().replace(/-/g, '').slice(0, 14)
    const chat = read<Chat[]>(CHATS, []).find((c) => c.id === chatId)
    const shares = read<Record<string, unknown>>('merzal_demo_shares', {})
    shares[token] = { title: chat?.title ?? 'Shared conversation', messages: read<Message[]>(MSGS(chatId), []) }
    write('merzal_demo_shares', shares)
    return token
  },
  getSharedChat: async (token: string) => {
    const shares = read<Record<string, { title: string; messages: Message[] }>>('merzal_demo_shares', {})
    return shares[token] ?? null
  },
  importSharedChat: async (token: string) => {
    const shares = read<Record<string, { title: string; messages: Message[] }>>('merzal_demo_shares', {})
    const s = shares[token]
    if (!s) return null
    const chat: Chat = { id: uuid(), title: s.title, bucket: 'Today', pinned: false, updated_at: now() }
    write(CHATS, [chat, ...read<Chat[]>(CHATS, [])])
    write(MSGS(chat.id), s.messages.map((m) => ({ ...m, id: uuid(), chat_id: chat.id, user_id: 'demo-user' })))
    return chat.id
  },

  // ── ADMIN: business-metrics dashboard ───────────────────────────────
  adminAnalytics: async (): Promise<AdminAnalytics> => {
    const qToday = QUESTIONS_DAILY[QUESTIONS_DAILY.length - 1].n
    const qYesterday = QUESTIONS_DAILY[QUESTIONS_DAILY.length - 2].n
    const q7d = sum(QUESTIONS_DAILY.slice(-7).map((p) => p.n))
    const qPrev7d = sum(QUESTIONS_DAILY.slice(-14, -7).map((p) => p.n))
    const q30d = sum(QUESTIONS_DAILY.map((p) => p.n))
    const newStudents7d = sum(STUDENTS_DAILY.slice(-7).map((p) => p.n))
    const newStudents30d = sum(STUDENTS_DAILY.map((p) => p.n))
    return {
      total_students: 128,
      active_students: 34,
      total_departments: DEPARTMENTS_SEED.length,
      total_chats: 341,
      total_questions: 1840 + q30d,
      questions_today: qToday,
      questions_yesterday: qYesterday,
      questions_7d: q7d,
      questions_prev_7d: qPrev7d,
      dau: 34,
      wau: 78,
      mau: 111,
      active_prev_7d: 71,
      new_students_7d: newStudents7d,
      new_students_30d: newStudents30d,
      feedback_total: 63,
      feedback_helpful: 41,
      feedback_not_helpful: 7,
      feedback_bugs: 6,
      feedback_features: 9,
      feedback_open: 11,
      questions_daily: QUESTIONS_DAILY,
      students_daily: STUDENTS_DAILY,
      heatmap: HEATMAP,
      top_students: TOP_STUDENTS,
      by_mode: { campus: 1520, world: 620 },
    }
  },

  listMemory: async (): Promise<MemoryItem[]> => read<MemoryItem[]>(MEMORY, []),
  addMemory: async (fact: string): Promise<MemoryItem> => {
    const item = { id: uuid(), fact }
    write(MEMORY, [item, ...read<MemoryItem[]>(MEMORY, [])])
    return item
  },
  removeMemory: async (id: string) => write(MEMORY, read<MemoryItem[]>(MEMORY, []).filter((x) => x.id !== id)),
  clearMemory: async () => write(MEMORY, []),

  // ── ADMIN: departments ────────────────────────────────────────────
  listDepartments: async (): Promise<Department[]> => read<Department[]>(DEPARTMENTS, DEPARTMENTS_SEED),
  createDepartment: async (name: string, code: string): Promise<Department> => {
    const d: Department = { id: uuid(), name: name.trim(), code: code.trim().toUpperCase() }
    const next = [...read<Department[]>(DEPARTMENTS, DEPARTMENTS_SEED), d].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))
    write(DEPARTMENTS, next)
    return d
  },
  deleteDepartment: async (id: string): Promise<void> => {
    write(DEPARTMENTS, read<Department[]>(DEPARTMENTS, DEPARTMENTS_SEED).filter((d) => d.id !== id))
  },

  // ── ADMIN: admins ─────────────────────────────────────────────────
  listAdmins: async (): Promise<AdminUser[]> => read<AdminUser[]>(ADMINS, ADMINS_SEED),
  promoteToDeptAdmin: async (registerNumber: string, department_id: string): Promise<void> => {
    const reg = registerNumber.trim()
    if (!reg) throw new Error('Enter a register number.')
    const dept = read<Department[]>(DEPARTMENTS, DEPARTMENTS_SEED).find((d) => d.id === department_id)
    if (!dept) throw new Error('Choose a department.')
    const student = read<DemoStudent[]>(STUDENTS, STUDENTS_SEED).find((s) => s.mobile === reg.replace(/\D/g, '') || s.mobile === reg)
    const admins = read<AdminUser[]>(ADMINS, ADMINS_SEED).filter((a) => a.register_number !== reg)
    admins.push({
      user_id: student?.id ?? `demo-admin-${uuid()}`,
      name: student?.name ?? reg,
      register_number: reg,
      department_id: dept.id,
      department_name: dept.name,
      is_super: false,
    })
    write(ADMINS, admins)
  },
  demoteAdmin: async (user_id: string): Promise<void> => {
    if (user_id === 'demo-user') throw new Error('You cannot demote yourself.')
    write(ADMINS, read<AdminUser[]>(ADMINS, ADMINS_SEED).filter((a) => a.user_id !== user_id))
  },

  // ── ADMIN: student roster ─────────────────────────────────────────
  listStudents: async (): Promise<DemoStudent[]> => read<DemoStudent[]>(STUDENTS, STUDENTS_SEED),
  addStudent: async (name: string, enrollment: string, department_id?: string | null, year?: number | null): Promise<void> => {
    const mobile = enrollment.trim()
    const list = read<DemoStudent[]>(STUDENTS, STUDENTS_SEED)
    if (list.some((s) => s.mobile === mobile)) throw new Error('A student with that enrollment already exists.')
    list.unshift({ id: uuid(), name: name.trim(), mobile, status: 'pending_profile', department_id: department_id ?? null, year: year ?? null })
    write(STUDENTS, list)
  },
  deleteStudent: async (enrollment: string, confirm: string): Promise<void> => {
    if (confirm.trim() !== enrollment.trim()) throw new Error('Enrollment confirmation did not match.')
    write(STUDENTS, read<DemoStudent[]>(STUDENTS, STUDENTS_SEED).filter((s) => s.mobile !== enrollment.trim()))
  },
  importStudents: async (rows: { name: string; mobile: string }[], opts?: { department_id?: string | null; year?: number | null }): Promise<number> => {
    const list = read<DemoStudent[]>(STUDENTS, STUDENTS_SEED)
    const seen = new Set(list.map((s) => s.mobile))
    let n = 0
    for (const r of rows) {
      const mobile = (r.mobile || '').replace(/\D/g, '')
      const name = (r.name || '').trim()
      if (!name || mobile.length < 6 || seen.has(mobile)) continue
      seen.add(mobile)
      list.unshift({ id: uuid(), name, mobile, status: 'pending_profile', department_id: opts?.department_id ?? null, year: opts?.year ?? null })
      n++
    }
    write(STUDENTS, list)
    return n
  },

  // ── ADMIN: campus knowledge (career-guidance) + PageIndex docs ──────
  getCareerGuide: async (): Promise<{ id: string; title: string; content: string } | null> =>
    read<{ id: string; title: string; content: string } | null>('merzal_demo_guide', null),
  saveCareerGuide: async (title: string, content: string): Promise<void> =>
    write('merzal_demo_guide', { id: 'demo-guide', title, content }),
  listCampusDocs: async (): Promise<{ id: string; doc_id: string; name: string; status: string; created_at: string }[]> =>
    read('merzal_demo_pidocs', [] as { id: string; doc_id: string; name: string; status: string; created_at: string }[]),
  uploadCampusDoc: async (file: File): Promise<void> => {
    const list = read('merzal_demo_pidocs', [] as { id: string; doc_id: string; name: string; status: string; created_at: string }[])
    list.unshift({ id: uuid(), doc_id: 'pi-demo-' + uuid().slice(0, 8), name: file.name, status: 'indexing', created_at: now() })
    write('merzal_demo_pidocs', list)
  },
  deleteCampusDoc: async (id: string): Promise<void> =>
    write('merzal_demo_pidocs', read('merzal_demo_pidocs', [] as { id: string }[]).filter((d) => d.id !== id)),
}

function mutateChat(id: string, fn: (c: Chat) => Chat) {
  write(CHATS, read<Chat[]>(CHATS, []).map((c) => (c.id === id ? fn(c) : c)))
}
function mutateMsg(id: string, fn: (m: Message) => Message) {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('merzal_demo_msgs_')) continue
    const list = read<Message[]>(k, [])
    if (list.some((m) => m.id === id)) write(k, list.map((m) => (m.id === id ? fn(m) : m)))
  }
}
