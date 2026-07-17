// Shared building blocks for the admin panel. Inline styles on CSS variables,
// same design language as the rest of the app (light/dark via vars).
import type { CSSProperties, ReactNode } from 'react'

export const S: Record<string, CSSProperties> = {
  input: {
    height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--line-strong)',
    background: 'var(--surface)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', minWidth: 0,
  },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' },
  th: {
    textAlign: 'left', padding: '8px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--line-strong)', whiteSpace: 'nowrap',
  },
  td: { padding: '9px 10px', fontSize: 13.5, color: 'var(--ink)', borderBottom: '1px solid var(--line)', verticalAlign: 'middle' },
}

export function Btn({ kind = 'ghost', small, style, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger'; small?: boolean }) {
  const base: CSSProperties = {
    height: small ? 30 : 36, padding: small ? '0 10px' : '0 14px', borderRadius: 8, fontSize: small ? 12.5 : 13.5,
    fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  }
  const kinds: Record<string, CSSProperties> = {
    primary: { background: 'var(--ink)', color: 'var(--paper)' },
    ghost: { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-strong)' },
    danger: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--line-strong)' },
  }
  return <button {...rest} style={{ ...base, ...kinds[kind], ...(rest.disabled ? { opacity: 0.5, cursor: 'default' } : {}), ...style }} />
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--paper-panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'off' | 'info'; children: ReactNode }) {
  const tones: Record<string, CSSProperties> = {
    ok: { background: 'var(--accent-soft)', color: 'var(--accent)' },
    warn: { background: 'rgba(239,68,68,.1)', color: 'var(--danger)' },
    off: { background: 'var(--surface-soft)', color: 'var(--muted)' },
    info: { background: 'var(--surface-soft)', color: 'var(--ink-soft)' },
  }
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, ...tones[tone] }}>{children}</span>
}

export function Modal({ title, onClose, children, width = 460 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: '86vh', overflow: 'auto', background: 'var(--paper-panel)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" className="mz-icon-btn" style={{ width: 32, height: 32 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Notice({ tone, text }: { tone: 'ok' | 'err'; text: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10,
      background: tone === 'ok' ? 'var(--accent-soft)' : 'rgba(239,68,68,.08)',
      color: tone === 'ok' ? 'var(--accent)' : 'var(--danger)',
    }}>{text}</div>
  )
}

export function Empty({ text }: { text: string }) {
  return <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--faint)', fontSize: 13.5 }}>{text}</div>
}
