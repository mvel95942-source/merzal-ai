import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { hasSupabase } from '../lib/supabase'
import { enterDemo } from '../lib/demo'
import { useIsMobile } from '../hooks/useIsMobile'
import { Logo } from './Logo'

export function Login() {
  const isMobile = useIsMobile()
  const [view, setView] = useState<'hero' | 'login'>('hero') // mobile two-view
  const [stage, setStage] = useState<'enrollment' | 'create' | 'signin'>('enrollment')
  const [enrollment, setEnrollment] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function checkEnrollment() {
    setErr(null); setInfo(null)
    const e = enrollment.trim()
    if (!e) return setErr('Enter your enrollment number.')
    if (!hasSupabase) return setErr('Supabase not configured — set VITE_SUPABASE_URL.')
    setBusy(true)
    try {
      const res = await api.checkEnrollment(e)
      if (!res.registered) return setErr('This enrollment number is not registered with your institution. Please contact your college or Merzal AI support.')
      if (res.hasPassword) { setStage('signin'); setInfo('Enter your password.') }
      else { setStage('create'); setInfo('First time signing in — create a password.') }
    } catch {
      setErr('Could not check that enrollment. Try again.')
    } finally { setBusy(false) }
  }

  async function createPassword() {
    setErr(null)
    if (password.length < 8) return setErr('Password must be at least 8 characters.')
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr('Use letters and at least one number.')
    if (password !== confirm) return setErr('Passwords do not match.')
    setBusy(true)
    try {
      await api.setFirstPassword(enrollment.trim(), password)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the password.')
    } finally { setBusy(false) }
  }

  async function signIn() {
    setErr(null)
    if (!password) return setErr('Enter your password.')
    setBusy(true)
    try {
      await api.signInWithPassword(enrollment.trim(), password)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setErr(/invalid login credentials/i.test(msg) ? 'Incorrect enrollment number or password.' : 'Could not sign in.')
    } finally { setBusy(false) }
  }

  function explore() { enterDemo(); window.location.reload() }
  function back() { setStage('enrollment'); setPassword(''); setConfirm(''); setErr(null); setInfo(null) }
  const af = !isMobile // autofocus only on desktop (avoids keyboard pop on the mobile hero)

  // Shared form body, reused by the desktop pane and the mobile sheet.
  const form = (
    <div style={{ width: '100%', maxWidth: 372 }}>
      <h2 style={{ fontWeight: 600, fontSize: 30, margin: '0 0 5px', letterSpacing: '-.015em', color: 'var(--ink)' }}>Welcome back</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        {stage === 'enrollment' ? 'Sign in with your enrollment number.'
          : stage === 'create' ? 'Create a password for your account.'
          : `Signing in as ${enrollment}.`}
      </p>

      {stage === 'enrollment' && (
        <>
          <label className="mono" style={lbl}>Enrollment number</label>
          <input value={enrollment} onChange={(e) => setEnrollment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkEnrollment()} placeholder="e.g. 21CS042" autoCapitalize="characters" autoComplete="username" autoFocus={af} style={field} />
          <button onClick={checkEnrollment} disabled={busy} style={{ ...primaryBtn, marginTop: 18 }}>{busy ? 'Checking…' : 'Continue'} <span className="mono">→</span></button>
        </>
      )}
      {stage === 'create' && (
        <>
          <label className="mono" style={lbl}>New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters, letters + a number" autoComplete="new-password" autoFocus={af} style={field} />
          <label className="mono" style={{ ...lbl, marginTop: 14 }}>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createPassword()} placeholder="re-enter to confirm" autoComplete="new-password" style={field} />
          <button onClick={createPassword} disabled={busy} style={{ ...primaryBtn, marginTop: 18 }}>{busy ? 'Creating…' : 'Create password & sign in'} <span className="mono">→</span></button>
          <div style={{ marginTop: 12 }}><button onClick={back} style={linkBtn}>← Use a different enrollment</button></div>
        </>
      )}
      {stage === 'signin' && (
        <>
          <label className="mono" style={lbl}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} placeholder="••••••••" autoComplete="current-password" autoFocus={af} style={field} />
          <button onClick={signIn} disabled={busy} style={{ ...primaryBtn, marginTop: 18 }}>{busy ? 'Signing in…' : 'Sign in'} <span className="mono">→</span></button>
          <div style={{ marginTop: 12 }}><button onClick={back} style={linkBtn}>← Use a different enrollment</button></div>
        </>
      )}

      {info && <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 14 }}>{info}</p>}
      {err && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }}>{err}</p>}

      <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', margin: '20px 0 0', lineHeight: 1.6 }}>
        Accounts are provisioned by your campus.<br />Not registered? Contact your administrator.
      </p>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={explore} style={{ border: 'none', background: 'transparent', color: 'var(--faint)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Explore a preview without signing in</button>
      </div>
    </div>
  )

  // ── Mobile: two-view (full hero → slide-up login sheet) ──────────────
  if (isMobile) {
    const login = view === 'login'
    return (
      <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: '#0d0d0d' }}>
        {/* Hero — scales + fades back when the sheet is up */}
        <div style={{ position: 'absolute', inset: 0, transition: 'transform .42s cubic-bezier(.32,0,.2,1), opacity .38s ease', transform: login ? 'scale(.95) translateY(-12px)' : 'none', opacity: login ? 0 : 1, pointerEvents: login ? 'none' : 'auto' }}>
          <Hero onSignIn={() => setView('login')} onExplore={explore} />
        </div>
        {/* Login sheet — slides up */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--paper-panel)', display: 'flex', flexDirection: 'column', transition: 'transform .44s cubic-bezier(.32,0,.2,1)', transform: login ? 'translateY(0)' : 'translateY(100%)', borderRadius: '22px 22px 0 0', boxShadow: '0 -12px 40px rgba(0,0,0,0.45)' }}>
          <div style={{ padding: '20px 24px 0', flex: 'none' }}>
            <button onClick={() => { setView('hero'); back() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}><span style={{ fontSize: 18 }}>←</span> Back</button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px 28px' }}>{form}</div>
        </div>
      </div>
    )
  }

  // ── Desktop: side-by-side split ──────────────────────────────────────
  return (
    <div className="login-shell" style={{ minHeight: '100vh', display: 'flex', background: '#0d0d0d' }}>
      <div className="hero-pane" style={{ flex: 1.1, position: 'relative', overflow: 'hidden', color: '#ececec', padding: '56px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'radial-gradient(120% 100% at 0% 0%, #1e1e1e 0%, #0d0d0d 55%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Logo size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 25, fontWeight: 600, color: '#ececec' }}>{brand.name}</span>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8e8e8e' }}>{brand.loginBadge}</span>
          </div>
        </div>
        <div style={{ maxWidth: 480 }}>
          <AnimatedTags tags={brand.loginTags} />
          <h1 style={{ fontWeight: 600, fontSize: 44, lineHeight: 1.08, letterSpacing: '-.02em', margin: '0 0 18px' }}>{brand.loginHeroTitle}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: '#b4b4b4', margin: 0 }}>{brand.loginHeroDesc}</p>
        </div>
        <div className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8e8e8e' }}>
          {brand.loginFeatures.map((f, i) => (<span key={f} style={{ display: 'flex', gap: 8 }}>{i > 0 && <span style={{ opacity: .3 }}>·</span>}{f}</span>))}
        </div>
        <div style={{ position: 'absolute', right: -110, bottom: -110, width: 340, height: 340, borderRadius: '50%', border: '1.5px solid #2a2a2a', background: 'radial-gradient(circle,rgba(255,255,255,0.03) 0%,transparent 70%)' }} />
      </div>
      <div className="login-form-pane" style={{ flex: 1, background: 'var(--paper-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ animation: 'mz-rise .6s cubic-bezier(.16,1,.3,1) both' }}>{form}</div>
      </div>
    </div>
  )
}

// Full-screen mobile hero with a Sign In button pinned to the bottom.
function Hero({ onSignIn, onExplore }: { onSignIn: () => void; onExplore: () => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#ececec', position: 'relative', overflow: 'hidden', background: 'radial-gradient(125% 100% at 0% 0%, #1e1e1e 0%, #0d0d0d 55%)' }}>
      <div style={{ padding: '54px 28px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={42} />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 19, fontWeight: 600, color: '#ececec' }}>{brand.name}</div>
          <div className="mono" style={{ fontSize: 8.5, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8e8e8e', marginTop: 2 }}>{brand.loginBadge}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px 28px' }}>
        <AnimatedTags tags={brand.loginTags} />
        <h1 style={{ fontWeight: 600, fontSize: 36, lineHeight: 1.12, letterSpacing: '-.02em', margin: '0 0 18px' }}>{brand.loginHeroTitle}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: '#b4b4b4', margin: 0, maxWidth: 320 }}>{brand.loginHeroDesc}</p>
      </div>

      <div style={{ padding: '0 28px 46px' }}>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #2a2a2a 40%, #2a2a2a 60%, transparent)', marginBottom: 22 }} />
        <div className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6e6e6e', marginBottom: 22 }}>
          {brand.loginFeatures.map((f, i) => (<span key={f} style={{ display: 'flex', gap: 8 }}>{i > 0 && <span style={{ opacity: .4 }}>·</span>}{f}</span>))}
        </div>
        <button onClick={onSignIn} style={{ ...primaryBtn, height: 54, borderRadius: 999, fontSize: 16 }}>Sign In <span style={{ fontSize: 18 }}>→</span></button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={onExplore} style={{ border: 'none', background: 'transparent', color: '#8e8e8e', fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>Explore a preview without signing in</button>
        </p>
      </div>
      <div style={{ position: 'absolute', right: -120, bottom: 80, width: 320, height: 320, borderRadius: '50%', border: '1px solid #2a2a2a', opacity: .6, pointerEvents: 'none' }} />
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
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ececec', animation: 'mz-pulse 1s infinite' }} />
      <span key={i} style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: '#b4b4b4', animation: 'tag-stream 2.2s both' }}>{tags[i]}</span>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }
const field: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--line-strong)', borderRadius: 12, background: 'var(--surface)', padding: '0 15px', fontSize: 16, color: 'var(--ink)', outline: 'none' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 50, border: 'none', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', padding: 0 }
