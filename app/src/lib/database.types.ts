export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: { action: string; college_id: string; detail: Json; id: number; ts: string; user_id: string | null }
        Insert: { action: string; college_id?: string; detail?: Json; id?: never; ts?: string; user_id?: string | null }
        Update: { action?: string; college_id?: string; detail?: Json; id?: never; ts?: string; user_id?: string | null }
        Relationships: []
      }
      chats: {
        Row: { bucket: string; created_at: string; id: string; pinned: boolean; title: string | null; updated_at: string; user_id: string }
        Insert: { bucket?: string; created_at?: string; id?: string; pinned?: boolean; title?: string | null; updated_at?: string; user_id: string }
        Update: { bucket?: string; created_at?: string; id?: string; pinned?: boolean; title?: string | null; updated_at?: string; user_id?: string }
        Relationships: []
      }
      message_feedback: {
        Row: { id: string; user_id: string; chat_id: string; message_id: string; type: string; comment: string | null; created_at: string }
        Insert: { id?: string; user_id: string; chat_id: string; message_id: string; type: string; comment?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string; chat_id?: string; message_id?: string; type?: string; comment?: string | null; created_at?: string }
        Relationships: []
      }
      kb_chunks: {
        Row: { college_id: string; content: string; created_at: string; document_id: string; embedding: string | null; id: string; metadata: Json }
        Insert: { college_id?: string; content: string; created_at?: string; document_id: string; embedding?: string | null; id?: string; metadata?: Json }
        Update: { college_id?: string; content?: string; created_at?: string; document_id?: string; embedding?: string | null; id?: string; metadata?: Json }
        Relationships: []
      }
      kb_documents: {
        Row: { college_id: string; created_at: string; id: string; metadata: Json; source: string | null; title: string }
        Insert: { college_id?: string; created_at?: string; id?: string; metadata?: Json; source?: string | null; title: string }
        Update: { college_id?: string; created_at?: string; id?: string; metadata?: Json; source?: string | null; title?: string }
        Relationships: []
      }
      messages: {
        Row: { chat_id: string; content: string; created_at: string; id: string; mode: string | null; reaction: string | null; role: string; user_id: string }
        Insert: { chat_id: string; content: string; created_at?: string; id?: string; mode?: string | null; reaction?: string | null; role: string; user_id: string }
        Update: { chat_id?: string; content?: string; created_at?: string; id?: string; mode?: string | null; reaction?: string | null; role?: string; user_id?: string }
        Relationships: []
      }
      shared_chats: {
        Row: { chat_id: string; created_at: string; token: string; user_id: string }
        Insert: { chat_id: string; created_at?: string; token: string; user_id: string }
        Update: { chat_id?: string; created_at?: string; token?: string; user_id?: string }
        Relationships: []
      }
      user_memory: {
        Row: { created_at: string; fact: string; id: string; user_id: string }
        Insert: { created_at?: string; fact: string; id?: string; user_id: string }
        Update: { created_at?: string; fact?: string; id?: string; user_id?: string }
        Relationships: []
      }
      user_profiles: {
        Row: { college_id: string; created_at: string; department: string | null; id: string; onboarding_done: boolean; role: string; semester: number | null }
        Insert: { college_id?: string; created_at?: string; department?: string | null; id: string; onboarding_done?: boolean; role?: string; semester?: number | null }
        Update: { college_id?: string; created_at?: string; department?: string | null; id?: string; onboarding_done?: boolean; role?: string; semester?: number | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
