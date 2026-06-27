// Anonymous preview credits — each device gets a small free allowance of real
// answers before being asked to sign in. The server (preview-chat edge fn) is
// the source of truth; this mirrors the remaining count for the UI.
const DEVICE_KEY = 'merzal_device_id'
const REMAINING_KEY = 'merzal_preview_remaining'
export const PREVIEW_LIMIT = 10

export function deviceId(): string {
  let d = localStorage.getItem(DEVICE_KEY)
  if (!d) {
    d = crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now()
    localStorage.setItem(DEVICE_KEY, d)
  }
  return d
}

export function previewRemaining(): number {
  const v = localStorage.getItem(REMAINING_KEY)
  return v == null ? PREVIEW_LIMIT : Math.max(0, Number(v))
}

export function setPreviewRemaining(n: number) {
  localStorage.setItem(REMAINING_KEY, String(Math.max(0, n)))
  window.dispatchEvent(new CustomEvent('merzal-preview', { detail: Math.max(0, n) }))
}
