import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
