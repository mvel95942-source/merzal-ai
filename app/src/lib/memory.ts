// Memory service layer.
//
// - Session memory: the recent conversation history sent with each request
//   (handled by the chat — see SESSION_TURN_LIMIT). Gives within-chat recall.
// - Persistent memory: durable user facts (name, interests, goals) saved to the
//   `user_memory` store and retrieved into the prompt on every turn, so the AI
//   remembers across conversations.
//
// Smart rules keep it to identity/preferences/goals — not every passing message.
import { api } from './api'
import type { MemoryItem } from './types'

export interface MemoryProvider {
  retrieveMemory(): Promise<MemoryItem[]>
  saveMemory(fact: string): Promise<MemoryItem>
  updateMemory?(id: string, fact: string): Promise<void>
  deleteMemory(id: string): Promise<void>
}

export const persistentMemory: MemoryProvider = {
  retrieveMemory: () => api.listMemory(),
  saveMemory: (fact) => api.addMemory(fact),
  deleteMemory: (id) => api.removeMemory(id),
}

/** How many recent turns to send as session context (older ones are dropped;
 *  summarization is a future step for very long chats). */
export const SESSION_TURN_LIMIT = 24

const MEMORY_ENABLED_KEY = 'merzal_memory_enabled'
export const memoryEnabled = () => localStorage.getItem(MEMORY_ENABLED_KEY) !== '0'
export const setMemoryEnabled = (on: boolean) => localStorage.setItem(MEMORY_ENABLED_KEY, on ? '1' : '0')

// Build the memory context block injected into the prompt.
export async function memoryContext(): Promise<string> {
  if (!memoryEnabled()) return ''
  const items = await persistentMemory.retrieveMemory()
  if (!items.length) return ''
  return 'What you remember about the user:\n' + items.map((m) => `- ${m.fact}`).join('\n')
}

// Smart extraction: pull durable identity/preference/goal facts from a user
// message and save the ones we don't already have. Deliberately conservative.
const PATTERNS: { re: RegExp; make: (m: RegExpMatchArray) => string }[] = [
  { re: /\bmy name is ([a-z][\w'’-]{1,30})/i, make: (m) => `User's name is ${cap(m[1])}.` },
  { re: /\bi am ([a-z][\w'’-]{1,30})\b(?!\s+(?:not|sure|going|trying|looking|here|able))/i, make: (m) => `User goes by ${cap(m[1])}.` },
  { re: /\bi(?:'m| am) (?:a |an )?(student|teacher|professor|developer|engineer|researcher|designer)\b/i, make: (m) => `User is a ${m[1].toLowerCase()}.` },
  { re: /\bi(?:'m| am)? ?studying ([\w\s/&-]{2,40})/i, make: (m) => `User is studying ${clean(m[1])}.` },
  { re: /\bi study ([\w\s/&-]{2,40})/i, make: (m) => `User studies ${clean(m[1])}.` },
  { re: /\bi like ([\w\s/&,-]{2,40})/i, make: (m) => `User likes ${clean(m[1])}.` },
  { re: /\bi(?:'m| am) interested in ([\w\s/&,-]{2,40})/i, make: (m) => `User is interested in ${clean(m[1])}.` },
  { re: /\bmy (?:goal|aim) is to ([\w\s/&,-]{2,60})/i, make: (m) => `User's goal: ${clean(m[1])}.` },
]

export async function extractMemories(userText: string): Promise<MemoryItem[]> {
  if (!memoryEnabled()) return []
  const facts = new Set<string>()
  for (const { re, make } of PATTERNS) {
    const m = userText.match(re)
    if (m) facts.add(make(m))
  }
  if (!facts.size) return []
  const existing = (await persistentMemory.retrieveMemory()).map((x) => x.fact.toLowerCase())
  const saved: MemoryItem[] = []
  for (const f of facts) {
    if (existing.some((e) => e === f.toLowerCase())) continue
    saved.push(await persistentMemory.saveMemory(f))
  }
  return saved
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const clean = (s: string) => s.trim().replace(/[.,!?]+$/, '').replace(/\s+/g, ' ')
