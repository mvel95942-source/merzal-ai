// MERZAL AI — Brand + theme tokens. White-label entry point.
// Tenants override these (later: resolved from tenants.brand_json by subdomain).

export const brand = {
  name: 'Merzal AI',
  shortName: 'Merzal',
  institution: 'Merzal AI',
  logoLetter: 'M',
  accent: '#bf5e36',

  loginBadge: 'Campus AI · Secured by MerzalLabs',
  loginHeroTitle: 'The AI that actually knows your campus.',
  loginHeroDesc:
    'A private assistant built for your institution — running securely on-premises. Your data never leaves. Powered by MerzalLabs.',
  loginSubtitle: 'Sign in with your Merzal AI account.',
  loginFeatures: ['On-premises', 'FERPA-ready', 'Private by default'],
  loginTags: ['Persistent memory', 'Streaming answers', 'Conversation history'],
  ssoLabel: 'Continue with University SSO',
  loginFooter: 'Hosted on-premises · Secured by MerzalLabs · FERPA-compliant.',

  sidebarSub: 'Campus · On-premises',
  aiName: 'Merzal AI',
  inputPlaceholder: 'Message Merzal AI…',
  inputPlaceholderOffline: 'Offline — message will queue…',
  disclaimer: 'Merzal AI can make mistakes. Private & on-premises · memory on.',
  emptyDesc:
    'Ask about courses, deadlines, financial aid, or campus life — I keep it private and on-campus.',

  departments: [
    'Computer Science', 'Electrical Engineering', 'Mechanical Engineering',
    'Civil Engineering', 'Business Administration', 'Arts & Humanities',
    'Natural Sciences', 'Social Sciences', 'Law', 'Medicine & Health Sciences',
  ],
  semesters: [1, 2, 3, 4, 5, 6, 7, 8],
  prompts: [
    'When is the add/drop deadline this term?',
    'How do I apply for financial aid?',
    "Find my advisor's office hours",
    "What's open on campus right now?",
  ],
} as const

// Design tokens lifted from Merzal AI.dc.html — the visual source of truth.
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
  accent: brand.accent,
  accentSoft: '#fbf1ec',
  danger: '#c0563a',
  fontDisplay: "'Newsreader', Georgia, serif",
  fontBody: "'Hanken Grotesk', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
} as const
