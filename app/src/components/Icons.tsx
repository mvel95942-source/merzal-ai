// Centralized line-icon set: minimal, stroke-based, currentColor.
// Replaces emoji across the app with a consistent professional visual
// language (Linear / Vercel / Notion style). 24x24 grid, ~1.8 stroke,
// rounded caps/joins so icons stay crisp at 15–20px.
import type { CSSProperties, ReactNode } from 'react'

export interface IconProps {
  size?: number
  style?: CSSProperties
  className?: string
}

function Svg({ size = 18, style, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {children}
    </svg>
  )
}

const THUMB_PATH = 'M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z M7 11l3.3-6.8a2 2 0 0 1 2.7 1.9V10h5.1a2 2 0 0 1 1.94 2.47l-1.44 6A2 2 0 0 1 16.32 20H9a2 2 0 0 1-2-2v-7Z'

export function ThumbUp(p: IconProps) {
  return (
    <Svg {...p}>
      {THUMB_PATH.split(' M').map((seg, i) => <path key={i} d={(i ? 'M' : '') + seg} />)}
    </Svg>
  )
}

export function ThumbDown(p: IconProps) {
  return (
    <Svg {...p}>
      <g transform="rotate(180 12 12)">
        {THUMB_PATH.split(' M').map((seg, i) => <path key={i} d={(i ? 'M' : '') + seg} />)}
      </g>
    </Svg>
  )
}

export function Upload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </Svg>
  )
}

export function FileDoc(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3v5a1 1 0 0 0 1 1h5" />
      <path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 13.5h6" />
      <path d="M9 17h6" />
    </Svg>
  )
}

export function Trash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M6 7l1 12.5A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.5L18 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  )
}

export function Image(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4.5 16.5 4.7-4.7a1.5 1.5 0 0 1 2.12 0L15 15.5" />
      <path d="m14 14.5 1.6-1.6a1.5 1.5 0 0 1 2.12 0l2.28 2.28" />
    </Svg>
  )
}

export function Camera(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6a1 1 0 0 1 .86-.4h5.88a1 1 0 0 1 .86.4l1 1.6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.4" />
    </Svg>
  )
}

export function Sparkle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3c.55 3.55 2.9 5.9 6.5 6.5-3.6.55-5.95 2.9-6.5 6.5-.55-3.6-2.9-5.95-6.5-6.5C9.1 8.9 11.45 6.55 12 3Z" />
      <path d="M19 15.5c.25 1.55 1.2 2.5 2.75 2.75-1.55.25-2.5 1.2-2.75 2.75-.25-1.55-1.2-2.5-2.75-2.75 1.55-.25 2.5-1.2 2.75-2.75Z" />
    </Svg>
  )
}

export function Bug(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
      <rect x="7.5" y="8.5" width="9" height="10.5" rx="4.5" />
      <path d="M12 8.5v10.5" />
      <path d="M4.5 12h3M16.5 12h3" />
      <path d="M5.5 17h2.6M15.9 17h2.6" />
      <path d="m6.5 7 2 1.8M17.5 7l-2 1.8" />
    </Svg>
  )
}

export function Lightbulb(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 18h6" />
      <path d="M10 21.5h4" />
      <path d="M12 2.5a6.7 6.7 0 0 0-3.8 12.2c.6.45 1 1.15 1.05 1.9v.4h5.5v-.4c.05-.75.45-1.45 1.05-1.9A6.7 6.7 0 0 0 12 2.5Z" />
    </Svg>
  )
}

export function Pencil(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  )
}

export function Inbox(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21.5 12.5h-5.3l-1.7 2.7h-4l-1.7-2.7H2.5" />
      <path d="M5.7 5.2 2.5 12v6.5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2V12l-3.2-6.8a2 2 0 0 0-1.8-1.2H7.5a2 2 0 0 0-1.8 1.2Z" />
    </Svg>
  )
}

export function BarChart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V11" />
      <path d="M12 20V4" />
      <path d="M20 20v-6.5" />
      <path d="M3 20h18" />
    </Svg>
  )
}

export function Wrench(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.35 2.35-2-2Z" />
    </Svg>
  )
}

export function Warning(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.3 3.9 1.9 18.3A2 2 0 0 0 3.6 21.3h16.8a2 2 0 0 0 1.73-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

export function Send(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21.5 2.5 10.7 13.3" />
      <path d="M21.5 2.5 14.8 21.5l-4.1-8.2-8.2-4.1Z" />
    </Svg>
  )
}

export function Copy(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  )
}

export function Share(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="18" cy="5.5" r="2.3" />
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="18" cy="18.5" r="2.3" />
      <path d="m8.1 10.7 7.8-4.4" />
      <path d="m8.1 13.3 7.8 4.4" />
    </Svg>
  )
}

export function Plus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  )
}

export function Book(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 2H20v18.5H6.5A2.5 2.5 0 0 1 4 18V4.5A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M4 18a2.5 2.5 0 0 1 2.5-2.5H20" />
    </Svg>
  )
}

export function Check(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  )
}

export function Mail(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 6.8 8.5 6 8.5-6" />
    </Svg>
  )
}

export function MessageCircle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.7-.85L3.5 20.5l1.5-4.3a8.3 8.3 0 0 1-1-4A8.4 8.4 0 1 1 21 11.5Z" />
    </Svg>
  )
}

// Filled variant (pin markers etc.) — most other icons in this set are
// stroke-only, but a solid star reads better at very small sizes.
export function Star({ size = 18, style, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" strokeLinejoin="round" />
    </svg>
  )
}

export function Link(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 15 15 9" />
      <path d="M13 5.5 14.2 4.3a3.7 3.7 0 1 1 5.2 5.2L18.2 10.7" />
      <path d="M11 18.5 9.8 19.7a3.7 3.7 0 1 1-5.2-5.2L5.8 13.3" />
    </Svg>
  )
}
