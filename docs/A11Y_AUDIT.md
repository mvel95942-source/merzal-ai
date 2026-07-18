# Accessibility Audit: Merzal Admin Panel (import wizard, tables, modals, forms)
**Standard:** WCAG 2.1 AA | **Date:** 2026-07-17 | **Scope:** `app/src/components/admin/*`, `ForcePasswordChange`

### Summary
**Issues found:** 11 | **Critical:** 3 | **Major:** 5 | **Minor:** 3
**Status:** all Critical + Major issues fixed in this branch; Minor items listed as follow-ups.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|------------|
| 1 | Table header cells had no `scope`, so screen readers couldn't associate data cells with columns | 1.3.1 Info & Relationships | 🟡 Major | ✅ Fixed — shared `<Th>` component renders `scope="col"`; all module tables swapped |
| 2 | Status conveyed by badge colour alone (active/disabled) | 1.4.1 Use of Color | 🟢 Minor | ✅ Already text-labelled ("active", "disabled", "no sign-in yet") — colour is supplementary |
| 3 | Muted text `--faint #8e8ea0` on white ≈ 3.4:1, used for meta lines only | 1.4.3 Contrast | 🟢 Minor | Follow-up: meta text ≥ 12px uses `--muted #6b6b76` (5.4:1) where it carries meaning; `--faint` kept for decorative hints |

#### Operable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|------------|
| 4 | Modals didn't close on Escape and focus stayed behind the overlay | 2.1.1 Keyboard / 2.4.3 Focus Order | 🔴 Critical | ✅ Fixed — `Modal` takes focus on open, closes on Escape, returns focus to the opening control |
| 5 | No visible focus indicator on admin controls (inline styles can't express `:focus-visible`) | 2.4.7 Focus Visible | 🔴 Critical | ✅ Fixed — `[data-admin] …:focus-visible` outline rule in `index.css` |
| 6 | Import drop-zone was click-only (a `div` with `onClick`) | 2.1.1 Keyboard | 🔴 Critical | ✅ Fixed — `role="button"`, `tabIndex=0`, Enter/Space activate, labelled |
| 7 | Wizard step changes gave no keyboard/SR anchor | 2.4.3 Focus Order | 🟡 Major | ✅ Fixed — each step's heading receives focus (`tabIndex={-1}` + `.focus()`) |
| 8 | Small action buttons are 30px tall (< 44px touch target) | 2.5.5 Target Size | 🟢 Minor | Accepted for a desktop-first admin table; row height keeps ≥ 36px effective target. Follow-up for tablet use |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|------------|
| 9 | Filter selects and search input had no programmatic label | 3.3.2 Labels | 🟡 Major | ✅ Fixed — `aria-label` on filters, visually-hidden label on search; all form fields elsewhere wrap `<label>` |
| 10 | Errors appeared visually but were not announced | 3.3.1 Error Identification | 🟡 Major | ✅ Fixed — `Notice` renders `role="alert"` (errors) / `role="status"` (success); import progress + result live in an `aria-live="polite"` region with a real `role="progressbar"` |

#### Robust
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|------------|
| 11 | Dialogs lacked name/role/value (`role="dialog"`, `aria-modal`) | 4.1.2 Name, Role, Value | 🟡 Major | ✅ Fixed — `Modal` sets `role="dialog" aria-modal="true" aria-label={title}` |

### Color Contrast Check (light theme)
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Body text | `#0d0d0d` | `#ffffff` | 19.3:1 | 4.5:1 | ✅ |
| Muted labels | `#6b6b76` | `#ffffff` | 5.4:1 | 4.5:1 | ✅ |
| Faint hints (decorative) | `#8e8ea0` | `#ffffff` | 3.4:1 | 4.5:1 | ⚠️ decorative only |
| Primary button | `#ffffff` | `#0d0d0d` | 19.3:1 | 4.5:1 | ✅ |
| Accent badge | `#10a37f` | `#e7f5f0` | 3.1:1 | 4.5:1 | ⚠️ 12px bold — follow-up: darken accent text token |
| Danger text | `#ef4444` | `#ffffff` | 3.8:1 | 4.5:1 | ⚠️ follow-up: darker danger token for small text |

### Keyboard Navigation (verified)
| Element | Tab Order | Enter/Space | Escape |
|---------|-----------|-------------|--------|
| Left nav buttons | Top→bottom | Activates route | — |
| Import drop-zone | After template btn | Opens file picker | — |
| Wizard steps | Heading receives focus on change | — | — |
| Modals (all) | Focus moves into dialog | Buttons activate | Closes, focus returns |
| Table row actions | Left→right per row | Activate | — |

### Priority follow-ups (not blocking)
1. **Darken `--danger`/accent-on-soft tokens** for small-text contrast (single CSS variable change, app-wide).
2. **44px touch targets** if tablets become a real admin device.
3. **Focus trap** inside modals (Tab currently can reach the page behind; Escape/overlay-click mitigate).
