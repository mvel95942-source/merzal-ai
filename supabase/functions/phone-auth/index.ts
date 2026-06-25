// Merzal AI — mobile + OTP authentication (no public sign-up).
//
// Pre-approved mobiles live in public.students (uploaded by a Super Admin).
// - action "request": if the mobile is registered, generate a 6-digit OTP,
//   store it hashed with a 5-min expiry, rate-limit, and send it by SMS (Twilio
//   if configured). When no SMS gateway is set it returns the code as `devCode`
//   so the flow is testable immediately.
// - action "verify": check the code, then mint a session by setting a fresh
//   random password on the user's synthetic phone-email and returning it; the
//   client signs in with it. Supabase then manages the session/refresh/expiry.
//
// Deployed with verify_jwt=false (this is the pre-auth endpoint). It only ever
// acts on already-approved mobiles and is rate-limited + attempt-limited.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const PHONE_DOMAIN = 'phone.merzal.local'
const OTP_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 30 * 1000
const MAX_SENDS_PER_HOUR = 6
const MAX_VERIFY_ATTEMPTS = 5

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const normalize = (m: string) => (m || '').replace(/\D/g, '')
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomPassword(): string {
  const a = new Uint8Array(18); crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) + 'Aa1!'
}
function gen6(): string {
  const a = new Uint32Array(1); crypto.getRandomValues(a)
  return String(a[0] % 1_000_000).padStart(6, '0')
}
async function audit(mobile: string, event: string, detail: Record<string, unknown> = {}) {
  await admin.from('auth_events').insert({ mobile, event, detail })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { action?: string; mobile?: string; code?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const mobile = normalize(body.mobile ?? '')
  if (mobile.length < 6) return json({ error: 'invalid_mobile' }, 400)

  const { data: student } = await admin.from('students').select('id,name,mobile,status,user_id').eq('mobile', mobile).maybeSingle()

  // ── REQUEST ───────────────────────────────────────────────────────
  if (body.action === 'request') {
    if (!student || student.status === 'blocked') {
      await audit(mobile, 'not_registered')
      return json({ registered: false })
    }
    const { data: prev } = await admin.from('otp_codes').select('last_sent_at,sent_count').eq('mobile', mobile).maybeSingle()
    if (prev) {
      const since = Date.now() - new Date(prev.last_sent_at).getTime()
      if (since < RESEND_COOLDOWN_MS) { await audit(mobile, 'rate_limited'); return json({ error: 'cooldown', retryIn: Math.ceil((RESEND_COOLDOWN_MS - since) / 1000) }, 429) }
      if (prev.sent_count >= MAX_SENDS_PER_HOUR && since < 3600_000) { await audit(mobile, 'rate_limited'); return json({ error: 'too_many_requests' }, 429) }
    }
    const code = gen6()
    const sentCount = prev && (Date.now() - new Date(prev.last_sent_at).getTime() < 3600_000) ? prev.sent_count + 1 : 1
    await admin.from('otp_codes').upsert({
      mobile, code_hash: await sha256hex(`${code}:${mobile}`),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(), attempts: 0,
      sent_count: sentCount, last_sent_at: new Date().toISOString(),
    })

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), tok = Deno.env.get('TWILIO_AUTH_TOKEN'), from = Deno.env.get('TWILIO_FROM')
    let smsSent = false
    if (sid && tok && from) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + btoa(`${sid}:${tok}`), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: '+' + mobile, From: from, Body: `Your Merzal AI verification code is ${code}` }),
        })
        smsSent = r.ok
      } catch { smsSent = false }
    }
    await audit(mobile, 'otp_sent', { sms: smsSent })
    // Expose the code only when no SMS gateway delivered it (so login is testable).
    return json({ registered: true, sms: smsSent, devCode: smsSent ? undefined : code })
  }

  // ── VERIFY ────────────────────────────────────────────────────────
  if (body.action === 'verify') {
    if (!student) return json({ error: 'not_registered' }, 400)
    const { data: otp } = await admin.from('otp_codes').select('*').eq('mobile', mobile).maybeSingle()
    if (!otp) return json({ error: 'no_code' }, 400)
    if (Date.now() > new Date(otp.expires_at).getTime()) { await admin.from('otp_codes').delete().eq('mobile', mobile); return json({ error: 'expired' }, 400) }
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) { await audit(mobile, 'verify_locked'); return json({ error: 'locked' }, 429) }
    const ok = (await sha256hex(`${(body.code ?? '').trim()}:${mobile}`)) === otp.code_hash
    if (!ok) {
      await admin.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('mobile', mobile)
      await audit(mobile, 'verify_fail')
      return json({ error: 'invalid', attemptsLeft: MAX_VERIFY_ATTEMPTS - otp.attempts - 1 }, 400)
    }

    const email = `${mobile}@${PHONE_DOMAIN}`
    const password = randomPassword()
    if (student.user_id) {
      await admin.auth.admin.updateUserById(student.user_id, { password })
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name: student.name, mobile },
      })
      if (error || !created.user) return json({ error: 'provision_failed', detail: error?.message }, 500)
      await admin.from('students').update({ user_id: created.user.id, status: 'active' }).eq('id', student.id)
    }
    await admin.from('otp_codes').delete().eq('mobile', mobile)
    await audit(mobile, 'verify_ok')
    return json({ ok: true, email, password })
  }

  return json({ error: 'unknown_action' }, 400)
})

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
