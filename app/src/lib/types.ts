export type Role = 'user' | 'assistant'
export type ChatMode = 'campus' | 'world'
export type Reaction = 'up' | 'down' | null

export interface Profile {
  id: string
  college_id: string
  department: string | null
  semester: number | null
  role: string
  onboarding_done: boolean
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
