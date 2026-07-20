// Manual theme control. Two independent, persisted choices:
//   • mode   — light / dark / system. Overrides the OS prefers-color-scheme by
//              stamping data-theme on <html>; 'system' clears it (CSS falls back
//              to the media query). See index.css for the matching selectors.
//   • accent — the highlight colour, applied as CSS variables on <html> so it
//              works on both light and dark surfaces (soft tint is translucent).
export type ThemeMode = 'system' | 'light' | 'dark'

const MODE_KEY = 'merzal_theme'
const ACCENT_KEY = 'merzal_accent'

export interface Accent { id: string; label: string; color: string; soft: string }

// A small, tasteful set. `soft` is a low-alpha tint of `color` so it reads well
// on white AND near-black without a per-theme variant.
export const ACCENTS: Accent[] = [
  { id: 'green', label: 'Green', color: '#10a37f', soft: 'rgba(16,163,127,0.14)' },
  { id: 'blue', label: 'Blue', color: '#2f6df6', soft: 'rgba(47,109,246,0.14)' },
  { id: 'purple', label: 'Purple', color: '#7c5cff', soft: 'rgba(124,92,255,0.14)' },
  { id: 'orange', label: 'Amber', color: '#e8730c', soft: 'rgba(232,115,12,0.15)' },
  { id: 'pink', label: 'Pink', color: '#e5459b', soft: 'rgba(229,69,155,0.14)' },
  { id: 'slate', label: 'Slate', color: '#64748b', soft: 'rgba(100,116,139,0.16)' },
]

export function getThemeMode(): ThemeMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(MODE_KEY) : null
  return v === 'light' || v === 'dark' ? v : 'system'
}
export function getAccentId(): string {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(ACCENT_KEY) : null
  return ACCENTS.some((a) => a.id === v) ? (v as string) : 'green'
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}
export function applyAccent(id: string) {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0]
  const root = document.documentElement
  root.style.setProperty('--accent', a.color)
  root.style.setProperty('--accent-soft', a.soft)
}

export function setThemeMode(mode: ThemeMode) { localStorage.setItem(MODE_KEY, mode); applyThemeMode(mode) }
export function setAccent(id: string) { localStorage.setItem(ACCENT_KEY, id); applyAccent(id) }

// Apply saved choices before first paint (called from main.tsx) so there is no
// flash of the wrong theme.
export function initTheme() {
  applyThemeMode(getThemeMode())
  applyAccent(getAccentId())
}
