import { useMemo, useState } from 'react'
import { brand } from '../lib/brand'
import type { Chat } from '../lib/types'
import { Logo } from './Logo'

interface Props {
  chats: Chat[]
  activeId: string | null
  account: string
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onPin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  onSettings: () => void
}

export function Sidebar(p: Props) {
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = p.chats.filter((c) => !q || c.title.toLowerCase().includes(q))
    const pinned = filtered.filter((c) => c.pinned)
    const rest = filtered.filter((c) => !c.pinned)
    const buckets: Record<string, Chat[]> = {}
    for (const c of rest) (buckets[c.bucket] ??= []).push(c)
    const out: { label: string; items: Chat[] }[] = []
    if (pinned.length) out.push({ label: 'Pinned', items: pinned })
    for (const label of ['Today', 'Yesterday', 'Previous 7 days', 'Older']) {
      if (buckets[label]?.length) out.push({ label, items: buckets[label] })
    }
    for (const [label, items] of Object.entries(buckets)) {
      if (!['Today', 'Yesterday', 'Previous 7 days', 'Older'].includes(label)) out.push({ label, items })
    }
    return out
  }, [p.chats, search])

  function startRename(c: Chat) {
    setRenaming(c.id); setRenameText(c.title); setMenuFor(null)
  }
  function commitRename() {
    if (renaming) p.onRename(renaming, renameText.trim() || 'New chat')
    setRenaming(null)
  }

  return (
    <aside style={{ width: 264, flex: 'none', background: 'var(--paper-app)', borderRight: '1px solid #e6e0d2', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '18px 12px 14px 15px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <Logo size={32} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.1, flex: 1, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 18, fontWeight: 500, color: '#1a1612' }}>{brand.name}</span>
          <span className="mono" style={{ fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--faint)' }}>{brand.sidebarSub}</span>
        </div>
      </div>

      <div style={{ padding: '2px 12px 9px' }}>
        <button onClick={p.onNew} style={{ width: '100%', height: 40, border: '1px solid #e2dccd', borderRadius: 8, background: '#fff', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px' }}>
          <Icon path="M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /> New chat
        </button>
      </div>

      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, border: '1px solid #e6dfd0', borderRadius: 9, background: '#f4eee2', padding: '0 11px' }}>
          <Icon path="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M21 21l-4-4" size={14} stroke="var(--faint)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)' }} />
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 8px' }}>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--faint)', padding: '11px 8px 5px' }}>{g.label}</div>
            {g.items.map((c) => (
              <div key={c.id} className="chat-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, height: 36, borderRadius: 8, padding: '0 6px 0 10px', fontSize: 13.5, color: 'var(--ink-soft)', background: c.id === p.activeId ? '#e8e1d3' : 'transparent' }}>
                {renaming === c.id ? (
                  <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }} onBlur={commitRename} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--ink)', font: 'inherit' }} />
                ) : (
                  <span onClick={() => p.onSelect(c.id)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.title}</span>
                )}
                <div className="row-actions" style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
                  {c.pinned && <span style={{ color: '#c47a35', marginRight: 2, fontSize: 10 }}>★</span>}
                  <button onClick={() => setMenuFor(menuFor === c.id ? null : c.id)} style={{ width: 22, height: 22, border: 'none', borderRadius: 6, background: 'transparent', color: '#b3ab9d', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>⋮</button>
                </div>
                {menuFor === c.id && (
                  <>
                    <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 48 }} />
                    <div style={{ position: 'absolute', right: 6, top: 34, zIndex: 49, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 12px 30px -8px #0003', padding: 4, width: 160 }}>
                      <MenuItem label="Rename" onClick={() => startRename(c)} />
                      <MenuItem label={c.pinned ? 'Unpin' : 'Pin'} onClick={() => { p.onPin(c.id, !c.pinned); setMenuFor(null) }} />
                      <div style={{ height: 1, background: 'var(--line)', margin: '3px 8px' }} />
                      <MenuItem label="Delete" danger onClick={() => { p.onDelete(c.id); setMenuFor(null) }} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
        {groups.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--faint)' }}>No chats yet.</div>}
      </div>

      <div style={{ borderTop: '1px solid #e6e0d2', padding: '9px 11px' }}>
        <button onClick={p.onSettings} style={{ width: '100%', height: 48, border: 'none', borderRadius: 11, background: 'transparent', color: 'var(--ink-soft)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', textAlign: 'left' }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: '#fff', flex: 'none' }}>{(p.account[0] || 'U').toUpperCase()}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.account}</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>Memory &amp; settings</span>
          </span>
        </button>
      </div>
    </aside>
  )
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ width: '100%', height: 34, border: 'none', borderRadius: 8, background: 'transparent', color: danger ? 'var(--danger)' : 'var(--ink-soft)', fontSize: 13, display: 'flex', alignItems: 'center', padding: '0 11px', textAlign: 'left' }}>
      {label}
    </button>
  )
}

function Icon({ path, size = 15, stroke = '#6a6358' }: { path: string; size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {path.split(' M').map((seg, i) => <path key={i} d={(i ? 'M' : '') + seg} />)}
    </svg>
  )
}
