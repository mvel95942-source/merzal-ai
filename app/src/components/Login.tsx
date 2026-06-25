import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { hasSupabase } from '../lib/supabase'
import { enterDemo } from '../lib/demo'
import { Logo } from './Logo'

export function Login() {
  const [roll, setRoll] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function signIn() {
    setErr(null)
    if (!roll.trim() || !password) return setErr('Enter your roll number and password.')
    if (!hasSupabase) return setErr('Supabase not configured — set VITE_SUPABASE_URL.')
    setBusy(true)
    try {
      await api.signInWithPassword(roll, password)
      // Auth listener in App handles the transition.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not sign in'
      setErr(/invalid login credentials/i.test(msg) ? 'Incorrect roll number or password.' : msg)
    } finally {
      setBusy(false)
    }
  }

  function explore() {
    enterDemo()
    window.location.reload()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#1d1a16' }}>
      {/* Hero */}
      <div
        style={{
          flex: 1.1, position: 'relative', overflow: 'hidden', color: '#f0ead8',
          padding: '56px 60px', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'radial-gradient(120% 100% at 0% 0%, #2a2117 0%, #1d1a16 55%)',
        }}
        className="hero-pane"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Logo size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 25, fontWeight: 500, color: '#f0ead8' }}>{brand.name}</span>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8a7c66' }}>{brand.loginBadge}</span>
          </div>
        </div>
        <div style={{ maxWidth: 480 }}>
          <AnimatedTags tags={brand.loginTags} />
          <h1 className="display" style={{ fontWeight: 400, fontSize: 46, lineHeight: 1.08, letterSpacing: '-.02em', margin: '0 0 18px' }}>{brand.loginHeroTitle}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: '#cabfa9', margin: 0 }}>{brand.loginHeroDesc}</p>
        </div>
        <div className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a7c66' }}>
          {brand.loginFeatures.map((f, i) => (
            <span key={f} style={{ display: 'flex', gap: 8 }}>{i > 0 && <span style={{ opacity: .3 }}>·</span>}{f}</span>
          ))}
        </div>
        <div style={{ position: 'absolute', right: -110, bottom: -110, width: 340, height: 340, borderRadius: '50%', border: '1.5px solid #3d2f1e', background: 'radial-gradient(circle,rgba(196,122,53,0.04) 0%,transparent 70%)' }} />
      </div>

      {/* Form */}
      <div style={{ flex: 1, background: 'var(--paper-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 368, animation: 'mz-rise .6s cubic-bezier(.16,1,.3,1) both' }}>
          <h2 className="display" style={{ fontWeight: 400, fontSize: 36, margin: '0 0 5px', letterSpacing: '-.015em', color: '#1a1612' }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>Sign in with your campus roll number.</p>

          <label className="mono" style={lbl}>Roll number</label>
          <input
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="e.g. 21CS042"
            autoCapitalize="characters"
            autoComplete="username"
            style={field}
          />
          <label className="mono" style={{ ...lbl, marginTop: 14 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="••••••••"
            autoComplete="current-password"
            style={field}
          />
          <button onClick={signIn} disabled={busy} style={{ ...primaryBtn, marginTop: 18 }}>
            {busy ? 'Signing in…' : 'Sign in'} <span className="mono">→</span>
          </button>

          {err && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }}>{err}</p>}

          <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', margin: '18px 0 0' }}>
            Accounts are provisioned by your campus. <br />Trouble signing in? Contact your administrator.
          </p>
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button onClick={explore} style={{ border: 'none', background: 'transparent', color: 'var(--faint)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Explore a preview without signing in</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// The landing tags stream in and out, one at a time — like generated text.
function AnimatedTags({ tags }: { tags: readonly string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((p) => (p + 1) % tags.length), 2200)
    return () => clearInterval(id)
  }, [tags.length])
  return (
    <div className="mono" style={{ height: 14, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c47a35', animation: 'mz-pulse 1s infinite' }} />
      <span key={i} style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c47a35', animation: 'tag-stream 2.2s both' }}>
        {tags[i]}
      </span>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9b9488', marginBottom: 8 }
const field: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--line-strong)', borderRadius: 11, background: '#fff', padding: '0 15px', fontSize: 15, color: 'var(--ink)', outline: 'none' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 48, border: 'none', borderRadius: 11, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
