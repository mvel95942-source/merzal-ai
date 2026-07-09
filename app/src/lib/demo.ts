// Preview / demo mode — a localStorage-backed mirror of the `api` surface so the
// whole web app is usable WITHOUT Supabase auth (which needs dashboard config).
// Enabled by the "Explore preview" button on the login screen. Data lives only
// in this browser. Real auth + Supabase take over once `demo` is off.
import type { AdminUser, Chat, Department, Feedback, FeedbackStatus, FeedbackType, MemoryItem, Message, Profile, Reaction } from './types'

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
  adminAnalytics: async (): Promise<Record<string, number>> => ({
    total_students: 42,
    active_students: 31,
    total_chats: 187,
    total_questions: 612,
    questions_today: 24,
    dau: 12,
    wau: 27,
    mau: 38,
    new_students_7d: 5,
    new_students_30d: 14,
    feedback_total: 63,
    feedback_helpful: 41,
    feedback_not_helpful: 7,
    feedback_bugs: 6,
    feedback_features: 9,
    feedback_open: 11,
  }),

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
