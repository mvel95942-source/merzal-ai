import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep React in its own long-lived vendor chunk (stable across app rebuilds,
    // so returning visitors keep it cached). The heavy markdown/KaTeX libraries
    // are used ONLY by the Markdown component, which ChatView imports lazily —
    // we let Vite's automatic code-splitting isolate them into an async chunk so
    // they stay off the login/first-paint path.
    //
    // NB: do NOT hand-group the markdown vendors via manualChunks. Forcing them
    // into one chunk drags a shared helper the entry needs into that chunk, which
    // turns the whole ~130KB bundle into a STATIC dependency of the entry and
    // ships it on the login screen. Automatic splitting avoids that. ChatView
    // warm-prefetches the chunk on mount so AI answers render with no delay.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (/[\\/]react(?:-dom)?[\\/]/.test(id) || id.includes('scheduler')) return 'react'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})
