// Admin data layer — everything the admin panel talks to.
//
// Two transports, by privilege:
//  • PostgREST via supabase-js for reads/CRUD — Postgres RLS is the authority
//    (Super Admin sees all, Dept Admin only their department; see the
//    admin-system migration).
//  • The `admin` edge function for privileged account lifecycle (password
//    resets, bans, cross-department moves) — service-role work that must never
//    run in the browser. It re-checks RBAC server-side and audits every call.
import { supabase } from './supabase'

export interface StudentRow {
  id: string
  name: string
  mobile: string
  status: string
  user_id: string | null
  department_id: string | null
  semester: number | null
  section: string | null
  year: number | null
  created_at: string
}

export interface TempKnowledge {
  id: string
  title: string
  content: string
  department_id: string | null
  semester: number | null
  section: string | null
  visibility: 'students' | 'admins' | 'all'
  priority: number
  starts_at: string
  expires_at: string
  active: boolean
  created_by: string | null
  created_at: string
}

export interface DocRow {
  id: string
  doc_id: string
  name: string
  status: string
  department_id: string | null
  semester: number | null
  section: string | null
  visibility: string
  doc_type: string | null
  effective_date: string | null
  expiry_date: string | null
  tags: string[]
  created_at: string
}

export interface AuditRow {
  id: number
  user_id: string | null
  action: string
  target: string | null
  detail: Record<string, unknown>
  ts: string
}

export interface StudentFilters {
  search?: string
  department_id?: string
  semester?: number
  section?: string
  status?: string
}

const PAGE_SIZE = 50

// Privileged actions → the `admin` edge function (JWT attached; RBAC there).
async function adminFn(body: Record<string, unknown>): Promise<any> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.error) {
    const nice: Record<string, string> = {
      forbidden: 'You are not allowed to do that.',
      forbidden_department: 'That student is in another department.',
      super_admin_only: 'Only a Super Admin can do that.',
      no_account: json.detail || 'That student has never signed in.',
      not_found: 'Student not found.',
      cannot_demote_self: 'You cannot demote yourself.',
    }
    throw new Error(nice[json.error] ?? json.detail ?? json.error ?? 'Action failed.')
  }
  return json
}

// Postgres 42703 = undefined_column: the admin-system migration hasn't run on
// this database yet. Fall back to the legacy column set so the panel stays
// usable (semester/section simply show as "—").
const FULL_COLS = 'id,name,mobile,status,user_id,department_id,semester,section,year,created_at'
const LEGACY_COLS = 'id,name,mobile,status,user_id,department_id,year,created_at'
// Postgres reads report 42703; PostgREST WRITES report PGRST204 ("could not
// find the column in the schema cache"). Both mean the same thing here: the
// admin-system migration hasn't run yet.
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  const msg = error?.message ?? ''
  return error?.code === '42703' || error?.code === 'PGRST204'
    || /column .* does not exist/i.test(msg) || /could not find the '.+' column/i.test(msg)
}

// ── Import types ──────────────────────────────────────────────────────────
export interface ImportRow {
  name: string
  mobile: string            // enrollment / register number (digits)
  department_id: string | null
  semester: number | null
  section: string | null
}
export interface ImportResult { inserted: number; updated: number; skipped: number; failed: number; errors: string[] }

function studentQuery(f: StudentFilters, cols: string) {
  let q = (supabase as any).from('students').select(cols, { count: 'exact' })
  const s = (f.search ?? '').trim()
  if (s) q = q.or(`name.ilike.%${s}%,mobile.ilike.%${s}%`)
  if (f.department_id) q = q.eq('department_id', f.department_id)
  if (cols === FULL_COLS) {
    if (f.semester != null) q = q.eq('semester', f.semester)
    if (f.section) q = q.eq('section', f.section)
  }
  if (f.status) q = q.eq('status', f.status)
  return q
}

export const adminApi = {
  PAGE_SIZE,

  // ── Students: server-side search/filter/paging (built for 10k rows) ────
  async listStudents(f: StudentFilters, page: number): Promise<{ rows: StudentRow[]; total: number }> {
    const from = page * PAGE_SIZE
    let { data, count, error } = await studentQuery(f, FULL_COLS)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error && isMissingColumn(error)) {
      ({ data, count, error } = await studentQuery(f, LEGACY_COLS)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1))
    }
    if (error) throw error
    const rows = ((data ?? []) as StudentRow[]).map((r) => ({ ...r, semester: r.semester ?? null, section: r.section ?? null }))
    return { rows, total: count ?? 0 }
  },

  // Bulk export: pages through the RLS-scoped roster (a Dept Admin's export
  // only ever contains their own department) and audits the event — the most
  // privacy-sensitive operation in the panel.
  async exportStudentsCsv(f: StudentFilters): Promise<string> {
    const all: StudentRow[] = []
    let cols = FULL_COLS
    for (let page = 0; ; page++) {
      const from = page * 1000
      let { data, error } = await studentQuery(f, cols).order('created_at', { ascending: false }).range(from, from + 999)
      if (error && isMissingColumn(error) && cols === FULL_COLS) {
        cols = LEGACY_COLS
        ;({ data, error } = await studentQuery(f, cols).order('created_at', { ascending: false }).range(from, from + 999))
      }
      if (error) throw error
      const rows = (data ?? []) as StudentRow[]
      all.push(...rows)
      if (rows.length < 1000) break
    }
    const { data: session } = await supabase.auth.getSession()
    await (supabase as any).from('audit_log').insert({
      user_id: session.session?.user.id, action: 'export_students', target: 'csv', detail: { rows: all.length, filters: f },
    })
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = 'name,enrollment,status,department_id,semester,section,year,created_at'
    return [head, ...all.map((r) => [r.name, r.mobile, r.status, r.department_id, r.semester, r.section, r.year, r.created_at].map(esc).join(','))].join('\n')
  },

  // ── Import: which of these enrollments already exist? (chunked lookup) ──
  async existingEnrollments(mobiles: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (let i = 0; i < mobiles.length; i += 500) {
      const { data, error } = await (supabase as any).from('students').select('mobile').in('mobile', mobiles.slice(i, i + 500))
      if (error) throw error
      for (const r of (data ?? []) as { mobile: string }[]) found.add(r.mobile)
    }
    return found
  },

  // ── Import: batched commit. RLS is the authority (a Dept Admin physically
  // cannot insert rows outside their department). updateExisting=false skips
  // duplicates; true also refreshes dept/semester/section on matching rows.
  // Falls back to the legacy column set on un-migrated databases (42703).
  async importStudents(
    rows: ImportRow[],
    opts: { updateExisting: boolean },
    onProgress?: (done: number, total: number) => void,
  ): Promise<ImportResult> {
    const existing = await this.existingEnrollments(rows.map((r) => r.mobile))
    const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] }
    const toWrite = rows.filter((r) => {
      if (existing.has(r.mobile) && !opts.updateExisting) { res.skipped++; return false }
      return true
    })

    let legacy = false
    const BATCH = 500
    for (let i = 0; i < toWrite.length; i += BATCH) {
      const slice = toWrite.slice(i, i + BATCH)
      const payload = (withSemSec: boolean) => slice.map((r) => ({
        name: r.name, mobile: r.mobile, status: 'pending_profile', department_id: r.department_id,
        ...(withSemSec ? { semester: r.semester, section: r.section } : {}),
      }))
      let { error } = await (supabase as any).from('students')
        .upsert(payload(!legacy), { onConflict: 'mobile', ignoreDuplicates: !opts.updateExisting })
      if (error && isMissingColumn(error) && !legacy) {
        legacy = true
        ;({ error } = await (supabase as any).from('students')
          .upsert(payload(false), { onConflict: 'mobile', ignoreDuplicates: !opts.updateExisting }))
      }
      if (error) {
        res.failed += slice.length
        res.errors.push(`Rows ${i + 1}–${i + slice.length}: ${error.message ?? 'write failed'}`)
      } else {
        for (const r of slice) { if (existing.has(r.mobile)) res.updated++; else res.inserted++ }
      }
      onProgress?.(Math.min(i + BATCH, toWrite.length), toWrite.length)
    }

    const { data: session } = await supabase.auth.getSession()
    await (supabase as any).from('audit_log').insert({
      user_id: session.session?.user.id, action: 'import_students', target: 'bulk',
      detail: { inserted: res.inserted, updated: res.updated, skipped: res.skipped, failed: res.failed },
    })
    return res
  },

  // ── Single add (Students module). Direct RLS-scoped insert. ─────────────
  async addStudent(row: ImportRow): Promise<void> {
    const base = { name: row.name, mobile: row.mobile, status: 'pending_profile', department_id: row.department_id }
    let { error } = await (supabase as any).from('students').insert({ ...base, semester: row.semester, section: row.section })
    if (error && isMissingColumn(error)) ({ error } = await (supabase as any).from('students').insert(base))
    if (error) {
      if (error.code === '23505') throw new Error('A student with that enrollment already exists.')
      throw new Error(error.message || 'Could not add student.')
    }
  },

  // ── Privileged lifecycle (edge function; audited server-side) ──────────
  resetPassword: (student_id: string) => adminFn({ action: 'reset_password', student_id }) as Promise<{ tempPassword: string }>,
  disableAccount: (student_id: string) => adminFn({ action: 'disable_account', student_id }),
  enableAccount: (student_id: string) => adminFn({ action: 'enable_account', student_id }),
  moveDepartment: (student_id: string, department_id: string | null) => adminFn({ action: 'move_department', student_id, department_id }),
  setSemesterSection: (student_id: string, semester: number | null, section: string | null) =>
    adminFn({ action: 'set_semester_section', student_id, semester, section }),
  promoteAdmin: (enrollment: string, department_id: string | null) => adminFn({ action: 'promote_admin', enrollment, department_id }),
  demoteAdmin: (user_id: string) => adminFn({ action: 'demote_admin', user_id }),

  // ── Temporary knowledge (RLS-scoped CRUD; the no-indexing prompt layer) ─
  async listTempKnowledge(): Promise<TempKnowledge[]> {
    const { data, error } = await (supabase as any).from('temporary_knowledge')
      .select('*').order('active', { ascending: false }).order('expires_at', { ascending: true }).limit(200)
    if (error) throw error
    return (data ?? []) as TempKnowledge[]
  },

  async saveTempKnowledge(item: Partial<TempKnowledge> & { title: string; content: string; expires_at: string }): Promise<void> {
    const { data: session } = await supabase.auth.getSession()
    const row = { ...item, created_by: item.created_by ?? session.session?.user.id, updated_at: new Date().toISOString() }
    const { error } = item.id
      ? await (supabase as any).from('temporary_knowledge').update(row).eq('id', item.id)
      : await (supabase as any).from('temporary_knowledge').insert(row)
    if (error) throw new Error(error.message || 'Could not save the update.')
  },

  async setTempKnowledgeActive(id: string, active: boolean): Promise<void> {
    const { error } = await (supabase as any).from('temporary_knowledge').update({ active, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async deleteTempKnowledge(id: string): Promise<void> {
    const { error } = await (supabase as any).from('temporary_knowledge').delete().eq('id', id)
    if (error) throw error
  },

  // ── Documents: metadata that gates retrieval (content lives in PageIndex) ─
  async listDocs(): Promise<DocRow[]> {
    const { data, error } = await (supabase as any).from('pageindex_docs').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return (data ?? []) as DocRow[]
  },

  async updateDocMeta(id: string, meta: Partial<DocRow>): Promise<void> {
    const { error } = await (supabase as any).from('pageindex_docs').update(meta).eq('id', id)
    if (error) throw new Error(error.message || 'Could not update document metadata.')
  },

  // ── Audit ───────────────────────────────────────────────────────────────
  async listAudit(limit = 200): Promise<AuditRow[]> {
    const { data, error } = await (supabase as any).from('audit_log').select('*').order('ts', { ascending: false }).limit(limit)
    if (error) throw error
    return (data ?? []) as AuditRow[]
  },

  // ── Dashboard counts (four cheap head-only queries) ─────────────────────
  async dashboardCounts(): Promise<{ students: number; departments: number; docs: number; updates: number }> {
    const count = async (table: string, filter?: (q: any) => any) => {
      let q = (supabase as any).from(table).select('id', { count: 'exact', head: true })
      if (filter) q = filter(q)
      const { count: n } = await q
      return n ?? 0
    }
    const nowIso = new Date().toISOString()
    const [students, departments, docs, updates] = await Promise.all([
      count('students'),
      count('departments'),
      count('pageindex_docs'),
      count('temporary_knowledge', (q: any) => q.eq('active', true).gte('expires_at', nowIso)),
    ])
    return { students, departments, docs, updates }
  },
}
