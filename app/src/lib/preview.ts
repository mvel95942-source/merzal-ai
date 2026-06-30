// Anonymous preview credits — EACH DEVICE gets its own free allowance of real
// answers PER DAY before being asked to sign in. This is not a shared/pooled
// global credit: every browser/phone keeps its own counter in localStorage,
// and the allowance resets at the start of each local calendar day. The server
// (preview-chat edge fn) remains the anti-abuse source of truth; this mirrors
// the remaining count for the UI and enforces the daily reset client-side.
const DEVICE_KEY = 'merzal_device_id'
const REMAINING_KEY = 'merzal_preview_remaining'
const DAY_KEY = 'merzal_preview_day'
export const PREVIEW_LIMIT = 10

export function deviceId(): string {
  let d = localStorage.getItem(DEVICE_KEY)
  if (!d) {
    d = crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now()
    localStorage.setItem(DEVICE_KEY, d)
  }
  return d
}

// Local calendar day, e.g. "2026-06-30". Used to roll the allowance over daily.
function today(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function previewRemaining(): number {
  // A new day → fresh 10 for this device.
  if (localStorage.getItem(DAY_KEY) !== today()) {
    localStorage.setItem(DAY_KEY, today())
    localStorage.setItem(REMAINING_KEY, String(PREVIEW_LIMIT))
    return PREVIEW_LIMIT
  }
  const v = localStorage.getItem(REMAINING_KEY)
  return v == null ? PREVIEW_LIMIT : Math.max(0, Number(v))
}

export function setPreviewRemaining(n: number) {
  localStorage.setItem(DAY_KEY, today())
  localStorage.setItem(REMAINING_KEY, String(Math.max(0, n)))
  window.dispatchEvent(new CustomEvent('merzal-preview', { detail: Math.max(0, n) }))
}
