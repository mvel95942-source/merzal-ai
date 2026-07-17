// Merzal AI — privileged admin actions (account lifecycle).
//
// Everything here needs the service role (GoTrue password writes, bans), so it
// cannot be done from the browser. RBAC is enforced HERE, against the caller's
// profile loaded from the database — never against anything the client claims.
//
// Scoping rules (see docs/ADMIN_SYSTEM_DESIGN.md):
//   Super Admin (role=admin, department_id NULL)  → any student, any action.
//   Dept Admin  (role=admin, department_id set)   → students of their own
//     department only; cross-department moves and admin promotion are refused.
//   Everyone else → 403.
//
// Every action writes an audit_log row: actor, action, target, detail.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Caller = { id: string; role: string; department_id: string | null }
type StudentRow = { id: string; name: string; mobile: string; status: string; user_id: string | null; department_id: string | null }

function tempPassword(): string {
  // 12 chars, unambiguous alphabet — read out over a counter, typed once.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

async function audit(actor: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  await service.from('audit_log').insert({ user_id: actor, action, target, detail })
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // 1. Authentication — who is calling?
  const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: authErr } = await authed.auth.getUser()
  if (authErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  // 2. RBAC — load the caller's profile from the DB.
  const { data: prof } = await service.from('user_profiles')
    .select('id,role,department_id,disabled').eq('id', userData.user.id).maybeSingle()
  if (!prof || prof.role !== 'admin' || prof.disabled) return json({ error: 'forbidden' }, 403)
  const caller: Caller = prof
  const isSuper = caller.department_id === null

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const action = String(body.action ?? '')

  // Resolve a target student and check the caller may act on them.
  async function targetStudent(): Promise<StudentRow | Response> {
    const id = body.student_id ? String(body.student_id) : null
    const mobile = body.enrollment ? String(body.enrollment).replace(/\D/g, '') : null
    if (!id && !mobile) return json({ error: 'student_required' }, 400)
    const q = service.from('students').select('id,name,mobile,status,user_id,department_id')
    const { data } = id ? await q.eq('id', id).maybeSingle() : await q.eq('mobile', mobile!).maybeSingle()
    if (!data) return json({ error: 'not_found' }, 404)
    if (!isSuper && data.department_id !== caller.department_id) return json({ error: 'forbidden_department' }, 403)
    return data as StudentRow
  }

  // ── reset_password: temp password + forced rotation at next login ─────
  if (action === 'reset_password') {
    const s = await targetStudent(); if (s instanceof Response) return s
    if (!s.user_id) return json({ error: 'no_account', detail: 'Student has never signed in — they can set a password at first login.' }, 400)
    const pw = tempPassword()
    const { error } = await service.auth.admin.updateUserById(s.user_id, { password: pw })
    if (error) return json({ error: 'reset_failed', detail: error.message }, 500)
    await service.from('user_profiles').update({ must_change_password: true }).eq('id', s.user_id)
    await audit(caller.id, 'reset_password', s.mobile, { student_id: s.id })
    // Returned ONCE to the admin's screen; never stored in plaintext.
    return json({ ok: true, tempPassword: pw })
  }

  // ── disable / enable: roster block + GoTrue ban (kills refresh tokens) ─
  if (action === 'disable_account' || action === 'enable_account') {
    const s = await targetStudent(); if (s instanceof Response) return s
    const disabling = action === 'disable_account'
    await service.from('students').update({ status: disabling ? 'blocked' : (s.user_id ? 'active' : 'pending_profile') }).eq('id', s.id)
    if (s.user_id) {
      const { error } = await service.auth.admin.updateUserById(s.user_id, { ban_duration: disabling ? '876000h' : 'none' })
      if (error) return json({ error: 'ban_failed', detail: error.message }, 500)
      await service.from('user_profiles').update({ disabled: disabling }).eq('id', s.user_id)
    }
    await audit(caller.id, action, s.mobile, { student_id: s.id })
    return json({ ok: true })
  }

  // ── move_department: Super Admin only (cross-department by definition) ─
  if (action === 'move_department') {
    if (!isSuper) return json({ error: 'super_admin_only' }, 403)
    const s = await targetStudent(); if (s instanceof Response) return s
    const dept = body.department_id ? String(body.department_id) : null
    await service.from('students').update({ department_id: dept }).eq('id', s.id)
    if (s.user_id) await service.from('user_profiles').update({ department_id: dept }).eq('id', s.user_id)
    await audit(caller.id, 'move_department', s.mobile, { student_id: s.id, from: s.department_id, to: dept })
    return json({ ok: true })
  }

  // ── set_semester_section: within the caller's scope ───────────────────
  if (action === 'set_semester_section') {
    const s = await targetStudent(); if (s instanceof Response) return s
    const patch: Record<string, unknown> = {}
    if (body.semester !== undefined) patch.semester = body.semester === null ? null : Number(body.semester)
    if (body.section !== undefined) patch.section = body.section === null ? null : String(body.section)
    if (!Object.keys(patch).length) return json({ error: 'nothing_to_update' }, 400)
    await service.from('students').update(patch).eq('id', s.id)
    if (s.user_id) await service.from('user_profiles').update(patch).eq('id', s.user_id)
    await audit(caller.id, 'set_semester_section', s.mobile, { student_id: s.id, ...patch })
    return json({ ok: true })
  }

  // ── promote / demote admins: Super Admin only ──────────────────────────
  if (action === 'promote_admin') {
    if (!isSuper) return json({ error: 'super_admin_only' }, 403)
    const s = await targetStudent(); if (s instanceof Response) return s
    if (!s.user_id) return json({ error: 'no_account', detail: 'They must sign in once before promotion.' }, 400)
    const dept = body.department_id ? String(body.department_id) : null // null = Super Admin
    const { error } = await service.from('user_profiles').update({ role: 'admin', department_id: dept }).eq('id', s.user_id)
    if (error) return json({ error: 'promote_failed', detail: error.message }, 500)
    await audit(caller.id, 'promote_admin', s.mobile, { department_id: dept })
    return json({ ok: true })
  }

  if (action === 'demote_admin') {
    if (!isSuper) return json({ error: 'super_admin_only' }, 403)
    const target = String(body.user_id ?? '')
    if (!target) return json({ error: 'user_required' }, 400)
    if (target === caller.id) return json({ error: 'cannot_demote_self' }, 400)
    const { error } = await service.from('user_profiles').update({ role: 'student', department_id: null }).eq('id', target)
    if (error) return json({ error: 'demote_failed', detail: error.message }, 500)
    await audit(caller.id, 'demote_admin', target, {})
    return json({ ok: true })
  }

  return json({ error: 'unknown_action' }, 400)
})
