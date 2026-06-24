import { useEffect, useState } from 'react'

// True on narrow viewports (phones). Drives the drawer vs. fixed-sidebar layout.
export function useIsMobile(breakpoint = 760): boolean {
  const [mobile, setMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false))
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return mobile
}
