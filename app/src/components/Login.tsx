import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { api } from '../lib/api'
import { hasSupabase } from '../lib/supabase'
import { enterDemo } from '../lib/demo'
import { Logo } from './Logo'

type Mode = 'email' | 'phone'

export function Login() {
  const [mode, setMode] = useState<Mode>('email')
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'enter' | 'verify'>('enter')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function sendCode() {
    setErr(null)
    if (!value.trim()) return setErr('Enter your university ' + mode)
    if (!hasSupabase) return setErr('Supabase not configured — set VITE_SUPABASE_URL.')
    setBusy(true)
    try {
      await api.sendOtp(value.trim(), mode)
      setStage('verify')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send code')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setErr(null)
    setBusy(true)
    try {
      await api.verifyOtp(value.trim(), code.trim(), mode)
      // Auth listener in App handles the transition.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setErr(null)
    if (!hasSupabase) return setErr('Supabase not configured — set VITE_SUPABASE_URL.')
    try {
      await api.signInWithGoogle()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Google sign-in is not enabled yet.')
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
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>{brand.loginSubtitle}</p>

          {stage === 'enter' ? (
            <>
              <button onClick={google} style={googleBtn}>
                <GoogleMark /> Continue with Google
              </button>
              <Divider label="or use your email" />
              <div style={{ display: 'flex', gap: 6, padding: 4, background: '#ece7dd', borderRadius: 11, marginBottom: 18 }}>
                {(['email', 'phone'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); if (m === 'phone' && !value.trim()) setValue('+91 '); if (m === 'email' && value.startsWith('+91')) setValue('') }}
                    style={tab(mode === m)}
                  >
                    {m === 'email' ? 'Email' : 'Phone'}
                  </button>
                ))}
              </div>
              <label className="mono" style={lbl}>Your {mode}</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                placeholder={mode === 'email' ? 'you@gmail.com' : '+91 98765 43210'}
                inputMode={mode === 'phone' ? 'tel' : 'email'}
                style={field}
              />
              <button onClick={sendCode} disabled={busy} style={primaryBtn}>
                {busy ? 'Sending…' : 'Send code'} <span className="mono">→</span>
              </button>
              <Divider label="just looking?" />
              <button onClick={explore} style={ssoBtn}>Explore the app — preview without sign-in →</button>
            </>
          ) : (
            <>
              <label className="mono" style={lbl}>Enter the code sent to {value}</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verify()}
                placeholder="123456"
                inputMode="numeric"
                style={{ ...field, letterSpacing: '.3em', textAlign: 'center', fontSize: 20 }}
              />
              <button onClick={verify} disabled={busy} style={primaryBtn}>
                {busy ? 'Verifying…' : 'Verify & sign in'} <span className="mono">→</span>
              </button>
              <button onClick={() => { setStage('enter'); setCode('') }} style={{ ...ssoBtn, marginTop: 10, border: 'none', background: 'transparent', color: 'var(--muted)' }}>
                ← Use a different {mode}
              </button>
            </>
          )}

          {err && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }}>{err}</p>}
          <p style={{ fontSize: 11, color: 'var(--faint)', textAlign: 'center', margin: '24px 0 0', lineHeight: 1.5 }}>{brand.loginFooter}</p>
        </div>
      </div>
    </div>
  )
}

function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: '#b3ab9d', fontSize: 12 }}>
      <div style={{ flex: 1, height: 1, background: '#e1dacb' }} />{label}<div style={{ flex: 1, height: 1, background: '#e1dacb' }} />
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" style={{ flex: 'none' }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39.9 35.6 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
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

const tab = (on: boolean): React.CSSProperties => ({
  flex: 1, height: 36, border: 'none', borderRadius: 8,
  background: on ? '#fff' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)',
  fontWeight: 600, fontSize: 13.5, boxShadow: on ? '0 1px 3px #0001' : 'none',
})
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9b9488', marginBottom: 8 }
const field: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--line-strong)', borderRadius: 11, background: '#fff', padding: '0 15px', fontSize: 15, color: 'var(--ink)', outline: 'none', marginBottom: 14 }
const primaryBtn: React.CSSProperties = { width: '100%', height: 48, border: 'none', borderRadius: 11, background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
const ssoBtn: React.CSSProperties = { width: '100%', height: 46, border: '1px solid var(--line-strong)', borderRadius: 11, background: '#fff', color: 'var(--ink)', fontSize: 14, fontWeight: 500 }
const googleBtn: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--line-strong)', borderRadius: 11, background: '#fff', color: 'var(--ink)', fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }
