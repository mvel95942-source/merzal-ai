// Preview / demo mode — a localStorage-backed mirror of the `api` surface so the
// whole web app is usable WITHOUT Supabase auth (which needs dashboard config).
// Enabled by the "Explore preview" button on the login screen. Data lives only
// in this browser. Real auth + Supabase take over once `demo` is off.
import type { Chat, Feedback, FeedbackStatus, FeedbackType, MemoryItem, Message, Profile, Reaction } from './types'

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

export const demoApi = {
  getSession: async () => ({ user: { id: 'demo-user', email: 'you@preview.merzal' } }),
  signOut: async () => exitDemo(),

  getProfile: async (): Promise<Profile | null> => read<Profile | null>(PROFILE, null),
  upsertProfile: async (p: Partial<Profile>) => {
    const cur = read<Profile | null>(PROFILE, null)
    write(PROFILE, { id: 'demo-user', college_id: 'demo', role: 'student', onboarding_done: true, ...cur, ...p })
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

  listMemory: async (): Promise<MemoryItem[]> => read<MemoryItem[]>(MEMORY, []),
  addMemory: async (fact: string): Promise<MemoryItem> => {
    const item = { id: uuid(), fact }
    write(MEMORY, [item, ...read<MemoryItem[]>(MEMORY, [])])
    return item
  },
  removeMemory: async (id: string) => write(MEMORY, read<MemoryItem[]>(MEMORY, []).filter((x) => x.id !== id)),
  clearMemory: async () => write(MEMORY, []),
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
