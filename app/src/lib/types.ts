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
