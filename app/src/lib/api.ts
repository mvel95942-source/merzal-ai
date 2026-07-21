// Data layer. Talks to the live Supabase project; RLS scopes every row to the
// signed-in user. All inserts set user_id because the messages/chats policies
// require user_id = auth.uid().
import { supabase } from './supabase'
import { demoApi, isDemo } from './demo'
import type { AdminAnalytics, AdminUser, Chat, Department, Feedback, FeedbackStatus, FeedbackType, MemoryItem, Message, Profile, Reaction } from './types'

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Not authenticated')
  return data.user.id
}

const randomToken = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 14) : Math.random().toString(36).slice(2, 16))

// Postgres 42703 = undefined_column. Lets a write target a column that a
// pending migration hasn't added yet and fall back instead of throwing.
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message ?? '')
}

export interface SharedConversation { title: string; messages: Message[] }

// Students sign in with their roll number + password. Supabase Auth is
// email-based, so we map a roll number to a stable synthetic email. Admins
// provision accounts with this same email + a password (see AUTH_INVITES.md).
const STUDENT_DOMAIN = (import.meta.env.VITE_STUDENT_EMAIL_DOMAIN as string) || 'students.merzal.local'
export function rollToEmail(roll: string): string {
  return `${roll.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${STUDENT_DOMAIN}`
}
export function emailToRoll(email: string | undefined): string {
  if (!email) return 'You'
  // Show just the roll/mobile (local part) for synthetic campus emails.
  return /@(students|phone)\.merzal\.local$/.test(email) ? email.split('@')[0] : email
}

// Call the phone-auth edge function. Public actions (check/set_password) work
// with the anon key; admin actions are gated by the signed-in user's JWT.
async function phoneAuth(body: Record<string, unknown>): Promise<any> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const isAdmin = String(body.action ?? '').startsWith('admin_')
  let bearer = anon
  if (isAdmin) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) bearer = data.session.access_token
  }
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phone-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

function setPwError(code: string | undefined, detail?: string): string {
  switch (code) {
    case 'not_registered': return 'This enrollment number is not registered with your institution.'
    case 'already_set': return 'A password is already set for this account. Sign in instead.'
    case 'weak': return detail || 'Pick a stronger password.'
    case 'provision_failed': return 'Could not set the password. Please try again.'
    default: return 'Could not set the password.'
  }
}

const realApi = {
  // ── AUTH ──────────────────────────────────────────────────────────
  // Invite-only: shouldCreateUser:false means an OTP is only sent to accounts
  // that already exist (i.e. were invited from Supabase). Unknown emails/phones
  // are rejected instead of silently self-registering.
  async sendOtp(identifier: string, mode: 'email' | 'phone') {
    const opts = mode === 'phone'
      ? { phone: identifier, options: { shouldCreateUser: false } }
      : { email: identifier, options: { shouldCreateUser: false } }
    const { error } = await supabase.auth.signInWithOtp(opts)
    if (error) throw error
  },

  async verifyOtp(identifier: string, token: string, mode: 'email' | 'phone') {
    const args =
      mode === 'phone'
        ? { phone: identifier, token, type: 'sms' as const }
        : { email: identifier, token, type: 'email' as const }
    const { data, error } = await supabase.auth.verifyOtp(args)
    if (error) throw error
    return data
  },

  async signInWithPassword(roll: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: rollToEmail(roll), password })
    if (error) throw error
    return data
  },

  // ── ENROLLMENT + PASSWORD (with first-login password creation) ────
  async checkEnrollment(enrollment: string): Promise<{ registered: boolean; hasPassword?: boolean }> {
    return phoneAuth({ action: 'check', enrollment })
  },

  async setFirstPassword(enrollment: string, password: string): Promise<void> {
    const data = await phoneAuth({ action: 'set_password', enrollment, password })
    if (!data.ok) throw new Error(setPwError(data.error, data.detail))
    // Sign in straight away with the freshly-created password.
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password })
    if (error) throw error
  },

  // ── ADMIN: student roster import ──────────────────────────────────
  // `department_id`/`year` are optional: a Super Admin may assign every
  // imported row to a department + year in one pass; a Dept Admin's caller
  // always passes their own department_id (RLS would reject anything else).
  async importStudents(rows: { name: string; mobile: string }[], opts?: { department_id?: string | null; year?: number | null }): Promise<number> {
    const seen = new Set<string>()
    const clean = rows
      .map((r) => ({ name: (r.name || '').trim(), mobile: (r.mobile || '').replace(/\D/g, '') }))
      .filter((r) => r.name && r.mobile.length >= 6 && !seen.has(r.mobile) && seen.add(r.mobile))
    if (!clean.length) return 0
    // `students` isn't in the generated DB types yet — cast for these admin calls.
    const { error } = await (supabase as any).from('students').upsert(
      clean.map((r) => ({
        name: r.name,
        mobile: r.mobile,
        status: 'pending_profile',
        department_id: opts?.department_id ?? null,
        year: opts?.year ?? null,
      })),
      { onConflict: 'mobile', ignoreDuplicates: true },
    )
    if (error) throw error
    return clean.length
  },

  async listStudents(): Promise<{ id: string; name: string; mobile: string; status: string; department_id: string | null; year: number | null }[]> {
    const { data } = await (supabase as any).from('students').select('id,name,mobile,status,department_id,year').order('created_at', { ascending: false })
    return (data ?? []) as { id: string; name: string; mobile: string; status: string; department_id: string | null; year: number | null }[]
  },

  async addStudent(name: string, enrollment: string, department_id?: string | null, year?: number | null): Promise<void> {
    const r = await phoneAuth({ action: 'admin_add', name, enrollment, department_id: department_id ?? null, year: year ?? null })
    if (!r.ok) {
      if (r.error === 'already_exists') throw new Error('A student with that enrollment already exists.')
      if (r.error === 'name_required') throw new Error('Name is required.')
      if (r.error === 'enrollment_required') throw new Error('Enrollment number is required.')
      if (r.error === 'forbidden') throw new Error('Only admins can add students.')
      throw new Error(r.detail || 'Could not add student.')
    }
  },

  async deleteStudent(enrollment: string, confirm: string): Promise<void> {
    const r = await phoneAuth({ action: 'admin_delete', enrollment, confirm })
    if (!r.ok) {
      if (r.error === 'confirmation_mismatch') throw new Error('Enrollment confirmation did not match.')
      if (r.error === 'not_found') throw new Error('Student not found.')
      if (r.error === 'forbidden') throw new Error('Only admins can delete students.')
      throw new Error(r.detail || 'Could not delete student.')
    }
  },

  async getCareerGuide(): Promise<{ id: string; title: string; content: string } | null> {
    const { data } = await (supabase as any).from('campus_knowledge').select('id,title,content').limit(1).maybeSingle()
    return data ?? null
  },

  async saveCareerGuide(title: string, content: string): Promise<void> {
    const me = await uid()
    const cur = await this.getCareerGuide()
    if (cur) {
      const { error } = await (supabase as any).from('campus_knowledge').update({ title, content, updated_at: new Date().toISOString(), updated_by: me }).eq('id', cur.id)
      if (error) throw error
    } else {
      const { error } = await (supabase as any).from('campus_knowledge').insert({ title, content, updated_by: me })
      if (error) throw error
    }
  },

  // ── ADMIN: Campus documents (PageIndex) ────────────────────────────
  async listCampusDocs(): Promise<{ id: string; doc_id: string; name: string; status: string; created_at: string }[]> {
    const { data } = await (supabase as any)
      .from('pageindex_docs')
      .select('id,doc_id,name,status,created_at')
      .order('created_at', { ascending: false })
    return (data ?? []) as { id: string; doc_id: string; name: string; status: string; created_at: string }[]
  },

  async uploadCampusDoc(file: File): Promise<{ doc_id: string; name: string; status: string }> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Not authenticated')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pageindex-upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed.')
    return json as { doc_id: string; name: string; status: string }
  },

  async deleteCampusDoc(id: string): Promise<void> {
    const { error } = await (supabase as any).from('pageindex_docs').delete().eq('id', id)
    if (error) throw error
  },

  // ── ADMIN: departments (College → Department → Year → Students) ───
  // Any authed user can read; only a Super Admin can write (RLS-gated).
  async listDepartments(): Promise<Department[]> {
    const { data, error } = await (supabase as any).from('departments').select('id,name,code').order('code', { ascending: true })
    if (error) throw error
    return (data ?? []) as Department[]
  },

  async createDepartment(name: string, code: string): Promise<Department> {
    const { data, error } = await (supabase as any)
      .from('departments')
      .insert({ name: name.trim(), code: code.trim().toUpperCase() })
      .select('id,name,code')
      .single()
    if (error) throw new Error(error.message || 'Could not create department.')
    return data as Department
  },

  async deleteDepartment(id: string): Promise<void> {
    const { error } = await (supabase as any).from('departments').delete().eq('id', id)
    if (error) throw new Error(error.message || 'Could not delete department.')
  },

  // ── ADMIN: admin roster (Super Admin manages Super + Department Admins) ──
  async listAdmins(): Promise<AdminUser[]> {
    const { data: profiles, error } = await (supabase as any).from('user_profiles').select('id,department_id').eq('role', 'admin')
    if (error) throw error
    const rows = (profiles ?? []) as { id: string; department_id: string | null }[]
    if (!rows.length) return []

    const ids = rows.map((r) => r.id)
    const { data: students } = await (supabase as any).from('students').select('user_id,name,mobile').in('user_id', ids)
    const studentMap = new Map(((students ?? []) as { user_id: string; name: string; mobile: string }[]).map((s) => [s.user_id, s]))

    const deptIds = [...new Set(rows.map((r) => r.department_id).filter(Boolean))] as string[]
    let deptMap = new Map<string, string>()
    if (deptIds.length) {
      const { data: depts } = await (supabase as any).from('departments').select('id,name').in('id', deptIds)
      deptMap = new Map(((depts ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]))
    }

    return rows.map((r) => {
      const s = studentMap.get(r.id)
      return {
        user_id: r.id,
        name: s?.name ?? r.id,
        register_number: s?.mobile ?? null,
        department_id: r.department_id,
        department_name: r.department_id ? deptMap.get(r.department_id) ?? null : null,
        is_super: !r.department_id,
      }
    })
  },

  async promoteToDeptAdmin(registerNumber: string, department_id: string): Promise<void> {
    const mobile = registerNumber.trim().replace(/\D/g, '')
    if (!mobile) throw new Error('Enter a register number.')
    if (!department_id) throw new Error('Choose a department.')
    const { data: student, error: sErr } = await (supabase as any).from('students').select('user_id,name').eq('mobile', mobile).maybeSingle()
    if (sErr) throw sErr
    if (!student?.user_id) throw new Error('No account found for that register number — the student must sign in at least once before they can be promoted.')
    const { error } = await (supabase as any).from('user_profiles').update({ role: 'admin', department_id }).eq('id', student.user_id)
    if (error) throw new Error('Could not update that profile. They may not have a profile row yet.')
  },

  async demoteAdmin(user_id: string): Promise<void> {
    const me = await uid()
    if (user_id === me) throw new Error('You cannot demote yourself.')
    const { error } = await (supabase as any).from('user_profiles').update({ role: 'student', department_id: null }).eq('id', user_id)
    if (error) throw error
  },

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
    return data
  },

  async signInWithSSO(domain: string) {
    // SSO stub: real deploys pass a SAML/OIDC provider configured per tenant.
    const { data, error } = await supabase.auth.signInWithSSO({ domain })
    if (error) throw error
    return data
  },

  async signOut() {
    await supabase.auth.signOut()
  },

  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },

  onAuthChange(cb: (event: string) => void) {
    return supabase.auth.onAuthStateChange((event) => cb(event))
  },

  // ── PROFILE ───────────────────────────────────────────────────────
  async getProfile(): Promise<Profile | null> {
    const id = await uid()
    const { data } = await supabase.from('user_profiles').select('*').eq('id', id).maybeSingle()
    return (data as Profile) ?? null
  },

  async upsertProfile(p: { department?: string; semester?: number; onboarding_done?: boolean }) {
    const id = await uid()
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id, ...p }, { onConflict: 'id' })
    if (error) throw error
  },

  // ── CHATS ─────────────────────────────────────────────────────────
  async listChats(): Promise<Chat[]> {
    // Embed messages(count) so the client knows which chats are empty without a
    // round-trip per row — used to gate "New chat" (see App.newChat).
    // Filter by user_id explicitly: RLS already scopes rows to the owner, but a
    // belt-and-suspenders own_id filter means a future policy regression can
    // never surface another user's chats in the sidebar.
    const me = await uid()
    const { data } = await supabase
      .from('chats')
      .select('id,title,bucket,pinned,updated_at,messages(count)')
      .eq('user_id', me)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    return (data ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? 'New chat',
      bucket: c.bucket,
      pinned: c.pinned,
      updated_at: c.updated_at,
      msgCount: (c.messages as { count: number }[] | null)?.[0]?.count ?? 0,
    })) as Chat[]
  },

  async createChat(title = 'New chat', bucket = 'Today'): Promise<Chat> {
    const id = await uid()
    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: id, title, bucket })
      .select('id,title,bucket,pinned,updated_at')
      .single()
    if (error) throw error
    // A just-created chat has no messages yet.
    return { ...data, title: data.title ?? 'New chat', msgCount: 0 } as Chat
  },

  async renameChat(chatId: string, title: string) {
    await supabase.from('chats').update({ title, updated_at: new Date().toISOString() }).eq('id', chatId)
  },

  async pinChat(chatId: string, pinned: boolean) {
    await supabase.from('chats').update({ pinned }).eq('id', chatId)
  },

  async deleteChat(chatId: string) {
    await supabase.from('chats').delete().eq('id', chatId)
  },

  async touchChat(chatId: string) {
    await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)
  },

  // ── MESSAGES ──────────────────────────────────────────────────────
  async listMessages(chatId: string): Promise<Message[]> {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Message[]
  },

  async addMessage(m: {
    chat_id: string
    role: 'user' | 'assistant'
    content: string
    mode?: 'campus' | 'world'
  }): Promise<Message> {
    const id = await uid()
    const { data, error } = await supabase
      .from('messages')
      .insert({ user_id: id, ...m })
      .select('*')
      .single()
    if (error) throw error
    return data as Message
  },

  async editMessage(messageId: string, content: string) {
    await supabase.from('messages').update({ content }).eq('id', messageId)
  },

  // ── ANSWER VERSIONS ───────────────────────────────────────────────
  // `variants` holds every generated version of an assistant reply and
  // `content` mirrors the active one, so exports / shared chats / the model's
  // own history keep reading `content` and never learn variants exist.
  //
  // The variants columns are added by a migration the operator runs by hand
  // (see supabase/migrations/). Until it runs, PostgREST rejects the write with
  // 42703 "column does not exist" — so we retry with content alone. Effect:
  // regenerate still works and simply keeps no history, instead of the whole
  // feature erroring out on an un-migrated database.
  async saveVariants(messageId: string, variants: string[], index: number): Promise<{ persisted: boolean }> {
    const content = variants[index]
    const { error } = await supabase
      .from('messages')
      .update({ content, variants, variant_index: index })
      .eq('id', messageId)
    if (!error) return { persisted: true }
    if (!isMissingColumn(error)) throw error
    await supabase.from('messages').update({ content }).eq('id', messageId)
    return { persisted: false }
  },

  async reactMessage(messageId: string, reaction: Reaction) {
    await supabase.from('messages').update({ reaction }).eq('id', messageId)
  },

  async deleteMessage(messageId: string) {
    await supabase.from('messages').delete().eq('id', messageId)
  },

  // ── FEEDBACK ──────────────────────────────────────────────────────
  // Every submission (thumbs on a reply, or a standalone bug/feature/general
  // note) lands in the `feedback` table, denormalized with register number +
  // department so Super Admin can triage without joining. RLS lets any authed
  // user insert their own row; only role='admin' can list/update.
  async submitFeedback(f: {
    chat_id?: string
    message_id?: string
    type: FeedbackType
    comment?: string
    student_message?: string
    ai_response?: string
  }) {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session?.user) throw new Error('Not authenticated')
    let department: string | null = null
    try {
      const prof = await this.getProfile()
      department = prof?.department ?? null
    } catch { /* profile lookup is best-effort */ }
    const { error } = await (supabase as any).from('feedback').insert({
      user_id: session.user.id,
      register_number: emailToRoll(session.user.email),
      department,
      chat_id: f.chat_id ?? null,
      message_id: f.message_id ?? null,
      type: f.type,
      student_message: f.student_message ?? null,
      ai_response: f.ai_response ?? null,
      comment: f.comment ?? null,
    })
    if (error) throw error
  },

  // ── ADMIN: feedback inbox ──────────────────────────────────────────
  async listFeedback(): Promise<Feedback[]> {
    const { data, error } = await (supabase as any).from('feedback').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Feedback[]
  },

  async updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
    const { error } = await (supabase as any).from('feedback').update({ status }).eq('id', id)
    if (error) throw error
  },

  // ── ADMIN: business-metrics dashboard ───────────────────────────────
  async adminAnalytics(): Promise<AdminAnalytics> {
    const { data, error } = await (supabase as any).rpc('admin_analytics')
    if (error) throw error
    return data as AdminAnalytics
  },

  // ── SHARING ───────────────────────────────────────────────────────
  // Create (or reuse) a public read-only link token for a conversation.
  async shareChat(chatId: string): Promise<string> {
    const id = await uid()
    const { data: existing } = await supabase.from('shared_chats').select('token').eq('chat_id', chatId).maybeSingle()
    if (existing?.token) return existing.token as string
    const token = randomToken()
    const { error } = await supabase.from('shared_chats').insert({ token, chat_id: chatId, user_id: id })
    if (error) throw error
    return token
  },

  // Public read of a shared conversation by token (no auth required).
  // Goes through the token-scoped `get_shared_chat` SECURITY DEFINER RPC — the
  // old direct table reads relied on broad "public read shared" RLS policies
  // that leaked EVERY shared chat into every signed-in user's list, so those
  // policies were dropped. The RPC returns ONLY the one conversation whose share
  // token matches exactly; an unknown token yields null.
  async getSharedChat(token: string): Promise<SharedConversation | null> {
    // Cast: get_shared_chat isn't in the generated DB types (same pattern as the
    // other admin RPCs below).
    const { data, error } = await (supabase as any).rpc('get_shared_chat', { p_token: token })
    if (error || !data) return null
    const d = data as { title?: string; messages?: Message[] }
    return { title: d.title ?? 'Shared conversation', messages: (d.messages ?? []) as Message[] }
  },

  // Copy a shared conversation into the signed-in user's account so they can
  // continue it from their own chat list. Returns the new chat id.
  async importSharedChat(token: string): Promise<string | null> {
    const id = await uid()
    const shared = await this.getSharedChat(token)
    if (!shared) return null
    const { data: chat, error } = await supabase
      .from('chats')
      .insert({ user_id: id, title: shared.title, bucket: 'Today' })
      .select('id')
      .single()
    if (error) throw error
    const rows = shared.messages.map((m) => ({ chat_id: chat.id, user_id: id, role: m.role, content: m.content, mode: m.mode ?? null }))
    if (rows.length) await supabase.from('messages').insert(rows)
    return chat.id as string
  },

  // ── MEMORY (user_memory.fact) ─────────────────────────────────────
  async listMemory(): Promise<MemoryItem[]> {
    const { data } = await supabase
      .from('user_memory')
      .select('id,fact')
      .order('created_at', { ascending: false })
    return (data ?? []) as MemoryItem[]
  },

  async addMemory(fact: string): Promise<MemoryItem> {
    const id = await uid()
    const { data, error } = await supabase
      .from('user_memory')
      .insert({ user_id: id, fact })
      .select('id,fact')
      .single()
    if (error) throw error
    return data as MemoryItem
  },

  async removeMemory(itemId: string) {
    await supabase.from('user_memory').delete().eq('id', itemId)
  },

  async clearMemory() {
    const id = await uid()
    await supabase.from('user_memory').delete().eq('user_id', id)
  },
}

// In preview/demo mode, route data methods to the localStorage store so the app
// works with no Supabase auth. Auth-only methods (OTP/OAuth) keep the real impl.
export const api: typeof realApi = new Proxy(realApi, {
  get(target, prop: string) {
    if (isDemo() && prop in demoApi) return (demoApi as Record<string, unknown>)[prop]
    return (target as Record<string, unknown>)[prop]
  },
}) as typeof realApi
