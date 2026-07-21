// Read-aloud for assistant replies, using the browser's built-in Web Speech API
// (speechSynthesis) — no dependency, no network, works offline. Only one
// utterance plays at a time; callers track which message is speaking.
import { stripThoughts } from './format'

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

// Turn a Markdown reply into clean prose for the voice: drop file bodies, math,
// and code (reading raw code aloud is noise), and strip Markdown punctuation so
// the voice doesn't say "star star" or "hash".
export function speakableText(md: string): string {
  let t = stripThoughts(md)
  t = t.replace(/<merzal-file[\s\S]*?<\/merzal-file>/gi, ' ')       // generated-file bodies
  t = t.replace(/```[\s\S]*?```/g, ' (code block) ')               // fenced code
  t = t.replace(/`([^`]+)`/g, '$1')                                 // inline code ticks
  t = t.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$\n]*\$/g, ' ') // math
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')                   // links/images → label
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '')                          // heading marks
  t = t.replace(/[*_>#|~]/g, ' ')                                   // stray md symbols
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

let activeUtterance: SpeechSynthesisUtterance | null = null

// Speak `text`; `onEnd` fires when it finishes OR is cancelled, so the caller
// can clear its "speaking" state. Cancels any prior utterance first.
export function speak(text: string, onEnd: () => void) {
  if (!isSpeechSupported() || !text) { onEnd(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1
  u.pitch = 1
  u.onend = () => { if (activeUtterance === u) activeUtterance = null; onEnd() }
  u.onerror = () => { if (activeUtterance === u) activeUtterance = null; onEnd() }
  activeUtterance = u
  window.speechSynthesis.speak(u)
}

export function cancelSpeech() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
  activeUtterance = null
}
