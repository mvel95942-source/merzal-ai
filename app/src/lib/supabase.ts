import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabase = Boolean(url && anonKey)

// Single shared client. Falls back to a harmless dummy if env is unset so the
// app still boots in pure-local/demo mode (storage flips automatically).
export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
)
