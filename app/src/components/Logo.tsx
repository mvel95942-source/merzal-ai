export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" style={{ flex: 'none', display: 'block' }}>
      <rect width="60" height="60" rx="14" fill="#1a1612" />
      <g transform="translate(30,30)">
        <ellipse rx="5.5" ry="16" transform="rotate(-5)" fill="#c47a35" opacity="0.92" />
        <ellipse rx="5" ry="14.5" transform="rotate(55)" fill="#c47a35" opacity="0.8" />
        <ellipse rx="5.5" ry="15" transform="rotate(120)" fill="#c47a35" opacity="0.86" />
        <circle r="5" fill="#e8914a" />
      </g>
    </svg>
  )
}
