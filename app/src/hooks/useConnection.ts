import { useEffect, useRef, useState } from 'react'
import type { ConnState } from '../lib/types'

// Live connection awareness. Offline => navigator.onLine false. Slow => a
// lightweight ping crosses a latency threshold. Polls every 12s.
export function useConnection(): ConnState {
  const [state, setState] = useState<ConnState>(navigator.onLine ? 'live' : 'offline')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const goOffline = () => setState('offline')
    const goOnline = () => setState('live')
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)

    async function ping() {
      if (!navigator.onLine) {
        setState('offline')
        return
      }
      const start = performance.now()
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
          method: 'GET',
          cache: 'no-store',
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        })
        const ms = performance.now() - start
        setState(ms > 1200 ? 'slow' : 'live')
      } catch {
        setState('offline')
      }
    }
    ping()
    timer.current = window.setInterval(ping, 12000)

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  return state
}
