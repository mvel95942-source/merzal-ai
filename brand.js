/**
 * MERZAL AI — Brand + Backend Config
 * ════════════════════════════════════════════════════════════════════════
 * This is the ONLY file you need to edit to:
 *   1. Rebrand the entire app (names, colors, copy).
 *   2. Connect a real backend (Supabase + your LLM + Graph RAG).
 *
 * Everything else in the app reads from here.
 *
 * Read CONNECT_BACKEND.md (in this folder) for a plain-English walkthrough.
 * ════════════════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────────────
   PART 1 — BRAND. Change text/colors/lists here. No code knowledge needed.
   ────────────────────────────────────────────────────────────────────── */
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

  // Departments (setup + settings)
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

  // Semesters (setup + settings)
  semesters: [
    'Semester 1','Semester 2','Semester 3','Semester 4',
    'Semester 5','Semester 6','Semester 7','Semester 8',
  ],

  // Suggested prompts
  prompts: [
    'When is the add/drop deadline this term?',
    'How do I apply for financial aid?',
    "Find my advisor's office hours",
    "What's open on campus right now?",
  ],
};


/* ──────────────────────────────────────────────────────────────────────
   PART 2 — BACKEND CONFIG. Where your data lives.
   When connecting Supabase, fill these in. Until then, the app uses
   localStorage (everything saves to the browser only).
   ────────────────────────────────────────────────────────────────────── */
window.MERZAL_CONFIG = {
  // ── 1. Where is your data stored? ────────────────────────────────────
  //   'local'    → browser localStorage only (current default — works offline, no setup)
  //   'supabase' → real database + auth + file storage
  storage: 'local',

  // ── 2. Supabase credentials (only needed if storage === 'supabase') ──
  //   Get these from your Supabase project → Settings → API.
  supabase: {
    url:     '',  // e.g. 'https://abcdefgh.supabase.co'
    anonKey: '',  // public anon key — safe to ship in the browser
  },

  // ── 3. Where does the AI come from? ──────────────────────────────────
  //   Each mode points to ONE endpoint. The app sends the chat history
  //   there and streams the reply back.
  endpoints: {
    // CAMPUS mode → your Graph RAG service (school knowledge base).
    // Until you wire it up, this falls back to canned answers.
    campus: '',  // e.g. 'https://your-graph-rag.example.com/answer'

    // WORLD mode → a general LLM (OpenAI / Anthropic / your own).
    world:  '',  // e.g. 'https://api.openai.com/v1/chat/completions'
  },

  // ── 4. Optional: auth token (sent on every request as Bearer …) ──────
  //   Leave blank when using Supabase — auth headers are added for you.
  authToken: '',
};


/* ══════════════════════════════════════════════════════════════════════
   PART 3 — MerzalAPI
   ════════════════════════════════════════════════════════════════════════
   Every action in the UI (sending a message, saving a chat, signing in,
   etc.) calls one of these functions. They have TWO implementations:

     • LOCAL   — uses localStorage. Already working. No backend needed.
     • SUPABASE — talks to your Supabase project + your AI endpoints.

   The UI doesn't know which one is active. Flip MERZAL_CONFIG.storage
   between 'local' and 'supabase' to switch.

   Every function returns a Promise so you can await it.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  const CFG = window.MERZAL_CONFIG;
  const K   = 'merzal_ai_state_v1';

  /* ── Tiny localStorage helpers ─────────────────────────────────────── */
  function readLS()      { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } }
  function writeLS(data) { try { localStorage.setItem(K, JSON.stringify(data)); } catch (e) {} }
  function uid()         { return 'c' + Date.now() + Math.floor(Math.random() * 999); }

  /* ── Supabase client (lazy-loaded; only created if you set storage='supabase') ── */
  let _sb = null;
  function sb() {
    if (_sb) return _sb;
    if (typeof window.supabase === 'undefined') {
      console.warn('[Merzal] Supabase JS not loaded. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> to your page.');
      return null;
    }
    if (!CFG.supabase.url || !CFG.supabase.anonKey) {
      console.warn('[Merzal] Supabase URL/anonKey missing in MERZAL_CONFIG.');
      return null;
    }
    _sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);
    return _sb;
  }

  const isSupabase = () => CFG.storage === 'supabase';

  /* ════════════════════════════════════════════════════════════════════
     The public API. Every UI action goes through one of these.
     ════════════════════════════════════════════════════════════════════ */
  window.MerzalAPI = {

    /* ── AUTH ─────────────────────────────────────────────────────────
       signIn       — log a user in (email/phone). Returns { user }.
       signOut      — log out, clear local session.
       getSession   — who is currently signed in? Returns { user } or null.
    ────────────────────────────────────────────────────────────────── */
    async signIn({ identifier, mode /* 'email' | 'phone' */ }) {
      if (isSupabase()) {
        const client = sb(); if (!client) throw new Error('Supabase not ready');
        // Magic-link (email) or OTP (phone). Adjust to your project's auth flow.
        const fn = mode === 'phone'
          ? client.auth.signInWithOtp({ phone: identifier })
          : client.auth.signInWithOtp({ email: identifier });
        const { data, error } = await fn;
        if (error) throw error;
        return { user: data.user || { id: identifier, email: identifier } };
      }
      const d = readLS();
      d.account = identifier;
      writeLS(d);
      return { user: { id: identifier, email: identifier } };
    },

    async signOut() {
      if (isSupabase()) { const c = sb(); if (c) await c.auth.signOut(); return; }
      const d = readLS(); delete d.account; writeLS(d);
    },

    async getSession() {
      if (isSupabase()) {
        const c = sb(); if (!c) return null;
        const { data } = await c.auth.getSession();
        return data.session ? { user: data.session.user } : null;
      }
      const d = readLS();
      return d.account ? { user: { id: d.account, email: d.account } } : null;
    },


    /* ── PROFILE (department + semester) ──────────────────────────────
       Supabase table: profiles
         id (uuid, PK, → auth.users)
         department text
         semester   text
    ────────────────────────────────────────────────────────────────── */
    async getProfile(userId) {
      if (isSupabase()) {
        const c = sb(); if (!c) return {};
        const { data } = await c.from('profiles').select('*').eq('id', userId).single();
        return data || {};
      }
      const d = readLS();
      return { department: d.dept || '', semester: d.semester || '' };
    },

    async updateProfile(userId, { department, semester }) {
      if (isSupabase()) {
        const c = sb(); if (!c) return;
        await c.from('profiles').upsert({ id: userId, department, semester });
        return;
      }
      const d = readLS(); d.dept = department; d.semester = semester; writeLS(d);
    },


    /* ── CHATS ────────────────────────────────────────────────────────
       Supabase table: chats
         id         text PK
         user_id    uuid → auth.users
         title      text
         bucket     text  ('Today' | 'Yesterday' | 'Previous 7 days')
         pinned     boolean
         created_at timestamptz default now()
    ────────────────────────────────────────────────────────────────── */
    async listChats(userId) {
      if (isSupabase()) {
        const c = sb(); if (!c) return [];
        const { data } = await c.from('chats').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        return data || [];
      }
      return readLS().chats || [];
    },

    async createChat({ title, bucket = 'Today' }) {
      const chat = { id: uid(), title, bucket, messages: [] };
      if (isSupabase()) {
        const c = sb(); if (!c) return chat;
        const { data: { user } } = await c.auth.getUser();
        await c.from('chats').insert({ id: chat.id, user_id: user.id, title, bucket });
      } else {
        const d = readLS(); d.chats = [chat, ...(d.chats || [])]; writeLS(d);
      }
      return chat;
    },

    async renameChat(chatId, title) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('chats').update({ title }).eq('id', chatId); return; }
      const d = readLS();
      d.chats = (d.chats || []).map(c => c.id === chatId ? { ...c, title } : c);
      writeLS(d);
    },

    async deleteChat(chatId) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('chats').delete().eq('id', chatId); return; }
      const d = readLS();
      d.chats = (d.chats || []).filter(c => c.id !== chatId);
      writeLS(d);
    },

    async pinChat(chatId, pinned) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('chats').update({ pinned }).eq('id', chatId); return; }
      const d = readLS();
      d.pinnedIds = d.pinnedIds || [];
      d.pinnedIds = pinned ? [...new Set([...d.pinnedIds, chatId])] : d.pinnedIds.filter(id => id !== chatId);
      writeLS(d);
    },

    async shareChat(chatId) {
      // Returns a public link. With Supabase, generate a row in `shared_chats`
      // with a random token, then expose a public read-only page at /share/:token.
      const token = uid();
      if (isSupabase()) {
        const c = sb(); if (c) await c.from('shared_chats').insert({ token, chat_id: chatId });
      }
      return { url: `${window.location.origin}/share/${token}` };
    },


    /* ── MESSAGES + AI ────────────────────────────────────────────────
       Supabase table: messages
         id         text PK
         chat_id    text → chats.id
         role       text  ('user' | 'assistant')
         content    text
         mode       text  ('campus' | 'world')  — only on assistant rows
         reaction   text  ('up' | 'down' | null)
         created_at timestamptz default now()

       sendMessage  — saves the user's message, kicks off an AI reply.
                      Calls onChunk(text) as the reply streams in,
                      then onDone(finalText, messageId) at the end.
    ────────────────────────────────────────────────────────────────── */
    async sendMessage({ chatId, text, attachments = [], mode = 'campus', onChunk, onDone, signal }) {
      // 1. Save the user message.
      const userMsg = { id: uid(), chat_id: chatId, role: 'user', content: text, created_at: new Date().toISOString() };
      if (isSupabase()) {
        const c = sb();
        if (c) {
          await c.from('messages').insert(userMsg);
          // Upload attachments to Supabase Storage bucket 'chat-uploads'.
          for (const a of attachments) {
            if (!a.file) continue;
            const path = `${chatId}/${userMsg.id}/${a.name}`;
            await c.storage.from('chat-uploads').upload(path, a.file);
          }
        }
      }

      // 2. Call the AI endpoint for this mode.
      const endpoint = (CFG.endpoints || {})[mode];
      if (!endpoint) {
        // No endpoint configured → tell the UI to use its built-in stub.
        return { useStub: true };
      }

      // 3. Stream the reply (Server-Sent Events / chunked JSON).
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(CFG.authToken ? { 'Authorization': 'Bearer ' + CFG.authToken } : {}),
        },
        body: JSON.stringify({ chatId, text, mode }),
        signal,
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        full += chunk;
        onChunk && onChunk(chunk);
      }

      // 4. Save the assistant reply.
      const aId = uid();
      if (isSupabase()) {
        const c = sb();
        if (c) await c.from('messages').insert({ id: aId, chat_id: chatId, role: 'assistant', content: full, mode });
      }
      onDone && onDone(full, aId);
      return { messageId: aId, content: full };
    },

    async listMessages(chatId) {
      if (isSupabase()) {
        const c = sb(); if (!c) return [];
        const { data } = await c.from('messages').select('*').eq('chat_id', chatId).order('created_at');
        return data || [];
      }
      const d = readLS();
      const chat = (d.chats || []).find(c => c.id === chatId);
      return chat ? chat.messages : [];
    },

    async editMessage(messageId, content) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('messages').update({ content }).eq('id', messageId); return; }
      // Local: caller (the UI's saveEdit) updates the in-memory chat directly.
    },

    async sendFeedback({ messageId, reaction /* 'up' | 'down' | null */ }) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('messages').update({ reaction }).eq('id', messageId); return; }
      const d = readLS(); d.reactions = d.reactions || {};
      if (reaction) d.reactions[messageId] = reaction; else delete d.reactions[messageId];
      writeLS(d);
    },

    async cancelGeneration({ chatId }) {
      // No-op locally. With a real backend, abort the fetch using AbortController.signal.
      return;
    },


    /* ── MEMORY (persistent things the AI remembers about the user) ───
       Supabase table: memory
         id      text PK
         user_id uuid → auth.users
         text    text
         created_at timestamptz default now()
    ────────────────────────────────────────────────────────────────── */
    async listMemory(userId) {
      if (isSupabase()) {
        const c = sb(); if (!c) return [];
        const { data } = await c.from('memory').select('*').eq('user_id', userId);
        return data || [];
      }
      return readLS().memory || [];
    },
    async addMemory(userId, text) {
      const item = { id: uid(), text };
      if (isSupabase()) { const c = sb(); if (c) await c.from('memory').insert({ ...item, user_id: userId }); return item; }
      const d = readLS(); d.memory = [...(d.memory || []), item]; writeLS(d); return item;
    },
    async removeMemory(itemId) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('memory').delete().eq('id', itemId); return; }
      const d = readLS(); d.memory = (d.memory || []).filter(m => m.id !== itemId); writeLS(d);
    },
    async clearMemory(userId) {
      if (isSupabase()) { const c = sb(); if (c) await c.from('memory').delete().eq('user_id', userId); return; }
      const d = readLS(); d.memory = []; writeLS(d);
    },
  };
})();
