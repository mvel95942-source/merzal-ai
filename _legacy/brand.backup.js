/**
 * MERZAL AI — Brand + Backend Config
 * Swap this single file to rebrand AND rewire the entire app.
 *
 * ── BACKEND INTEGRATION ──
 * When your backend is ready, implement MerzalAPI below.
 * The UI calls MerzalAPI.sendMessage() on every send.
 *
 * Example (uncomment and fill in your endpoint):
 *
 *   window.MerzalAPI = {
 *     baseUrl: 'https://your-api.example.com/v1',
 *
 *     async sendMessage({ chatId, text, attachments }) {
 *       const formData = new FormData();
 *       formData.append('chat_id', chatId);
 *       formData.append('text', text);
 *       attachments.forEach((a, i) => {
 *         if (a.file) formData.append(`file_${i}`, a.file, a.name);
 *       });
 *       const res = await fetch(`${this.baseUrl}/chat/send`, {
 *         method: 'POST',
 *         headers: { 'Authorization': `Bearer ${this.getToken()}` },
 *         body: formData,
 *       });
 *       return res.json(); // { reply: "...", sources: [...] }
 *     },
 *
 *     async streamReply({ chatId, onChunk, onDone }) {
 *       const res = await fetch(`${this.baseUrl}/chat/${chatId}/stream`);
 *       const reader = res.body.getReader();
 *       const decoder = new TextDecoder();
 *       while (true) {
 *         const { done, value } = await reader.read();
 *         if (done) { onDone(); break; }
 *         onChunk(decoder.decode(value));
 *       }
 *     },
 *
 *     getToken() { return localStorage.getItem('merzal_token') || ''; },
 *   };
 */

window.BRAND = {
  // Identity
  name:           'MERZAL AI',
  shortName:      'Merzal',
  institution:    'Merzal AI',
  logoLetter:     'M',
  accentColor:    '#bf5e36',

  // Login screen
  loginBadge:     'Campus AI · Secured by MerzalLabs',
  loginHeroTitle: 'The AI that actually knows your campus.',
  loginHeroDesc:  'A private assistant built for your institution — running securely on-premises. Your data never leaves. Powered by MerzalLabs.',
  loginSubtitle:  'Sign in with your Merzal AI account.',
  loginFeatures:  ['On-premises', 'FERPA-ready', 'Private by default'],
  loginTags:      ['Persistent memory', 'Streaming answers', 'Conversation history'],
  ssoLabel:       'Continue with University SSO',
  loginFooter:    'Hosted on-premises · Secured by MerzalLabs · FERPA-compliant.',

  // App chrome
  sidebarSub:     'Campus · On-premises',
  aiName:         'Merzal AI',

  // Composer
  inputPlaceholder:        'Message Merzal AI…',
  inputPlaceholderOffline: 'Offline — message will queue…',
  disclaimer:              'Merzal AI can make mistakes. Private & on-premises · memory on.',

  // Empty state
  emptyDesc: 'Ask about courses, deadlines, financial aid, or campus life — I keep it private and on-campus.',

  // Departments — shown on the setup screen and in settings
  departments: [
    'Computer Science',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Business Administration',
    'Arts & Humanities',
    'Natural Sciences',
    'Social Sciences',
    'Law',
    'Medicine & Health Sciences',
  ],

  // Semesters — shown on the setup screen and in settings
  semesters: [
    'Semester 1',
    'Semester 2',
    'Semester 3',
    'Semester 4',
    'Semester 5',
    'Semester 6',
    'Semester 7',
    'Semester 8',
  ],

  // Suggested prompts
  prompts: [
    'When is the add/drop deadline this term?',
    'How do I apply for financial aid?',
    'Find my advisor\'s office hours',
    'What\'s open on campus right now?',
  ],
};
