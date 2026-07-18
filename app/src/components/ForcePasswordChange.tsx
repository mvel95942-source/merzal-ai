// Shown after sign-in when an admin has reset this account's password
// (user_profiles.must_change_password). Cannot be skipped: the only ways out
// are choosing a new password or signing out.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { brand } from '../lib/brand'
import { Logo } from './Logo'

export function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return }
    if (pw !== pw2) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw new Error(error.message)
      await supabase.from('user_profiles').update({ must_change_password: false } as never).eq('id', (await supabase.auth.getUser()).data.user!.id)
      onDone()
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'Could not change the password.')
    } finally { setBusy(false) }
  }

  const input: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 12px', borderRadius: 10, fontSize: 15,
    border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
  }

  return (
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--paper-app)', padding: 16 }}>
      <form onSubmit={submit} style={{ width: 'min(380px, 100%)', background: 'var(--paper-panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Logo size={40} /></div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', textAlign: 'center', margin: '0 0 6px' }}>Choose a new password</h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', textAlign: 'center', margin: '0 0 18px' }}>
          Your {brand.shortName ?? brand.name} password was reset by an admin. Pick a new one to continue.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <input style={input} type={show ? 'text' : 'password'} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <input style={input} type={show ? 'text' : 'password'} placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: '100%', height: 44, marginTop: 14, borderRadius: 10, border: 'none', background: 'var(--ink)', color: 'var(--paper)', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Set password & continue'}
        </button>
        <button type="button" onClick={() => api.signOut()} style={{ width: '100%', height: 38, marginTop: 8, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13.5, cursor: 'pointer' }}>
          Sign out
        </button>
      </form>
    </div>
  )
}
