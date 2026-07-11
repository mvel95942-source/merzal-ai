import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initBrand } from './lib/brand'

// Resolve the tenant brand (env + optional runtime JSON) before first paint so
// the app renders fully branded — no flash of the default identity.
initBrand().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Register the service worker (PWA install + faster repeat loads). Best-effort.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline/unsupported — ignore */ })
  })
}
