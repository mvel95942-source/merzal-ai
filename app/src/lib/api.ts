// Data layer. Talks to the live Supabase project; RLS scopes every row to the
// signed-in user. All inserts set user_id because the messages/chats policies
// require user_id = auth.uid().
import { supabase } from './supabase'
import { demoApi, isDemo } from './demo'
import type { Chat, MemoryItem, Message, Profile, Reaction } from './types'

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Not authenticated')
  return data.user.id
}

const realApi = {
  // ── AUTH ──────────────────────────────────────────────────────────
  async sendOtp(identifier: string, mode: 'email' | 'phone') {
    const opts = mode === 'phone' ? { phone: identifier } : { email: identifier }
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

  onAuthChange(cb: () => void) {
    return supabase.auth.onAuthStateChange(() => cb())
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
    const { data } = await supabase
      .from('chats')
      .select('id,title,bucket,pinned,updated_at')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    return (data ?? []).map((c) => ({ ...c, title: c.title ?? 'New chat' })) as Chat[]
  },

  async createChat(title = 'New chat', bucket = 'Today'): Promise<Chat> {
    const id = await uid()
    const { data, error } = await supabase
      .from('chats')
      .insert({ user_id: id, title, bucket })
      .select('id,title,bucket,pinned,updated_at')
      .single()
    if (error) throw error
    return { ...data, title: data.title ?? 'New chat' } as Chat
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

  async reactMessage(messageId: string, reaction: Reaction) {
    await supabase.from('messages').update({ reaction }).eq('id', messageId)
  },

  async deleteMessage(messageId: string) {
    await supabase.from('messages').delete().eq('id', messageId)
  },

  // ── FEEDBACK ──────────────────────────────────────────────────────
  async submitFeedback(f: { chat_id: string; message_id: string; type: 'up' | 'down'; comment?: string }) {
    const id = await uid()
    const { error } = await supabase.from('message_feedback').insert({ user_id: id, ...f })
    if (error) throw error
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
