import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SECURITY: these are live provider secrets that must only ever exist server-side
// (as Supabase Edge Function secrets). They are used in the browser ONLY for
// local dev (see lib/llm.ts, lib/knowledge.ts, which gate them behind
// import.meta.env.DEV). In a production build we hard-blank them via `define` so
// that even if .env.local or a Vercel env var supplies a value, it can never be
// inlined into the shipped bundle.
const SERVER_ONLY_SECRETS = ['VITE_AI_API_KEY', 'VITE_GEMINI_API_KEY', 'VITE_PAGEINDEX_API_KEY']

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only strip for production builds; `vite dev` keeps the keys so local dev works.
  define: command === 'build'
    ? Object.fromEntries(SERVER_ONLY_SECRETS.map((k) => [`import.meta.env.${k}`, 'undefined']))
    : {},
  build: {
    // Split big, cacheable vendors into their own chunks so the initial load is
    // smaller and repeat visits hit cache. Admin-only code (xlsx, charts) is
    // already split via React.lazy in App.tsx.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (/[\\/]react(?:-dom)?[\\/]/.test(id) || id.includes('scheduler')) return 'react'
          if (/react-markdown|remark|rehype|katex|micromark|mdast|hast|unist|property-information|space-separated|comma-separated|decode-named/.test(id)) return 'markdown'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
}))
