// ════════════════════════════════════════════════════════════════════════
// REBRAND ENTRY POINT — change everything about how the app looks & reads here.
//
// Three ways to override, in increasing priority:
//   1. Edit the defaults below (then rebuild).
//   2. Build-time env vars (VITE_BRAND_NAME, VITE_BRAND_ACCENT, VITE_AUDIENCE…)
//      — bake a tenant's identity into a Docker image without editing code.
//   3. Runtime brand JSON (VITE_BRAND_JSON_URL) — fetched at boot and merged
//      over everything, so one image can serve many tenants by URL.
//
// See REBRAND.md for the full walkthrough.
// ════════════════════════════════════════════════════════════════════════

// Audience keeps tenant copy/branding flexible. Login now goes straight to chat
// after authentication; there is no student department/semester setup screen.
export type Audience = 'college' | 'school' | 'open'

export interface Brand {
  name: string
  shortName: string
  institution: string
  logoLetter: string
  accent: string
  audience: Audience

  loginBadge: string
  loginHeroTitle: string
  loginHeroDesc: string
  loginSubtitle: string
  loginFeatures: string[]
  loginTags: string[]
  ssoLabel: string
  loginFooter: string

  sidebarSub: string
  aiName: string
  inputPlaceholder: string
  inputPlaceholderOffline: string
  disclaimer: string
  emptyTitle: string
  emptyDesc: string

  // Legacy option lists kept for older tenant JSON compatibility.
  departments: string[]
  semesters: number[]
  classes: string[]
  sections: string[]

  prompts: string[]
}

// ── Defaults (Merzal AI) ────────────────────────────────────────────────
const defaults: Brand = {
  name: 'Merzal AI',
  shortName: 'Merzal',
  institution: 'Merzal AI',
  logoLetter: 'M',
  accent: '#bf5e36',
  audience: 'college',

  loginBadge: 'Campus AI · Secured by MerzalLabs',
  loginHeroTitle: 'The AI that actually knows your campus.',
  loginHeroDesc:
    'A private assistant built for your institution — running securely on-premises. Your data never leaves. Powered by MerzalLabs.',
  loginSubtitle: 'Sign in with your enrollment number.',
  loginFeatures: ['On-premises', 'FERPA-ready', 'Private by default'],
  loginTags: ['Persistent memory', 'Streaming answers', 'Conversation history'],
  ssoLabel: 'Continue with University SSO',
  loginFooter: 'Hosted on-premises · Secured by MerzalLabs · FERPA-compliant.',

  sidebarSub: 'Campus · On-premises',
  aiName: 'Merzal AI',
  inputPlaceholder: 'Message Merzal AI…',
  inputPlaceholderOffline: 'Offline — message will queue…',
  disclaimer: 'Merzal AI can make mistakes. Private & on-premises · memory on.',
  emptyTitle: 'How can I help on campus?',
  emptyDesc:
    'Ask about courses, deadlines, financial aid, or campus life — I keep it private and on-campus.',

  departments: [
    'Computer Science', 'Electrical Engineering', 'Mechanical Engineering',
    'Civil Engineering', 'Business Administration', 'Arts & Humanities',
    'Natural Sciences', 'Social Sciences', 'Law', 'Medicine & Health Sciences',
  ],
  semesters: [1, 2, 3, 4, 5, 6, 7, 8],
  classes: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'],
  sections: ['A', 'B', 'C', 'D', 'E'],
  prompts: [
    'When is the add/drop deadline this term?',
    'How do I apply for financial aid?',
    "Find my advisor's office hours",
    "What's open on campus right now?",
  ],
}

// Live, mutable brand object. Components import this; overrides mutate it
// before first render (see initBrand in main.tsx), so reads stay simple.
export const brand: Brand = { ...defaults }

// Design tokens (paper palette etc.) — not per-tenant except accent, which is
// also exposed as the --accent CSS variable and kept in sync on override.
export const t = {
  paper: '#ece8df',
  paperPanel: '#f6f3ec',
  paperApp: '#f3f0e9',
  ink: '#1d1a16',
  inkSoft: '#33302a',
  muted: '#857e72',
  faint: '#a79f91',
  line: '#ece5d6',
  lineStrong: '#ddd6c8',
  get accent() { return brand.accent },
  accentSoft: '#fbf1ec',
  danger: '#c0563a',
  fontDisplay: "'Newsreader', Georgia, serif",
  fontBody: "'Hanken Grotesk', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
}

function syncCssVars() {
  if (typeof document === 'undefined') return
  const r = document.documentElement.style
  r.setProperty('--accent', brand.accent)
  document.title = brand.name
}

export function applyBrand(override: Partial<Brand>) {
  Object.assign(brand, override)
  syncCssVars()
}

// Merge build-time env vars + an optional runtime JSON, then sync the theme.
// Awaited in main.tsx before the app renders so the first paint is branded.
export async function initBrand(): Promise<void> {
  // SECURITY: read each brand var by STATIC property access. Never bind the whole
  // `import.meta.env` object (e.g. `const env = import.meta.env`) — the bundler
  // inlines the entire env object as a literal when it sees a whole-object
  // reference, which would leak every VITE_ secret into the browser bundle.
  const envOverride: Partial<Brand> = {}
  if (import.meta.env.VITE_BRAND_NAME) envOverride.name = String(import.meta.env.VITE_BRAND_NAME)
  if (import.meta.env.VITE_BRAND_SHORT) envOverride.shortName = String(import.meta.env.VITE_BRAND_SHORT)
  if (import.meta.env.VITE_BRAND_INSTITUTION) envOverride.institution = String(import.meta.env.VITE_BRAND_INSTITUTION)
  if (import.meta.env.VITE_BRAND_LOGO_LETTER) envOverride.logoLetter = String(import.meta.env.VITE_BRAND_LOGO_LETTER)
  if (import.meta.env.VITE_BRAND_ACCENT) envOverride.accent = String(import.meta.env.VITE_BRAND_ACCENT)
  if (import.meta.env.VITE_AUDIENCE) envOverride.audience = String(import.meta.env.VITE_AUDIENCE) as Audience
  applyBrand(envOverride)

  const url = import.meta.env.VITE_BRAND_JSON_URL as string | undefined
  if (url) {
    try {
      const res = await fetch(url)
      if (res.ok) applyBrand(await res.json())
    } catch { /* keep current brand on fetch failure */ }
  }
  syncCssVars()
}
