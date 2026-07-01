# MedStudy OS — Design System

## Color tokens
Defined in `src/index.css` as CSS custom properties on `:root` and `[data-theme="light"]`.

| Token | Dark | Light |
|-------|------|-------|
| `--navy` | `#0F172A` | — |
| `--navy2` | `#1E293B` | — |
| `--navy3` | `#334155` | — |
| `--blue` | `#3B82F6` | — |
| `--blue2` | `#60A5FA` | — |
| `--amber` | `#F59E0B` | — |
| `--emerald` | `#10B981` | — |
| `--red` | `#EF4444` | — |
| `--indigo` | `#6366F1` | — |
| `--mist` | `#94A6B8` | `#64748B` |
| `--cloud` | `#E8EDF5` | — |
| `--page-bg` | `--navy` | `#F8FAFC` |
| `--text-primary` | `#F8FAFC` | `#0F172A` |
| `--text-secondary` | `--mist` | `--mist` |
| `--card-bg` | `rgba(255,255,255,0.03)` | `#FFFFFF` |
| `--card-border` | `rgba(255,255,255,0.08)` | `#E2E8F0` |
| `--input-bg` | `rgba(255,255,255,0.06)` | `#FFFFFF` |
| `--input-border` | `rgba(255,255,255,0.1)` | `#D1D5DB` |
| `--float-bg` | `rgba(20,22,35,0.88)` | `rgba(255,255,255,0.85)` |

Each colored token also has a `-L` variant for low-opacity backgrounds (e.g., `--blueL: rgba(59,130,246,0.1)`).

## Typography
- **Body:** `DM Sans` (weights 300–700 via Google Fonts)
- **Display/headings:** `DM Serif Display` (italic available)
- **Monospace/stats:** `DM Mono` (weights 300–500)
- Utility classes in `index.css`: `.mono`, `.serif`
- Body default weight: 400; 450 in light mode

## Theme
- Dark default. Toggle via `data-theme="light"` on `<html>`.
- Saved in localStorage key `medstudy-theme`. Applied in `main.jsx` before React mount to prevent flash.

## Spacing & layout
- Page content: `max-width: 1200px`, padding `36px 40px` (desktop), `24px 20px` (tablet), `20px 16px` (mobile)
- Sidebar: fixed 260px left, backdrop-filter blur. Collapses on `<=768px` via translateX.
- Cards: `border-radius: 16px–24px`, `backdrop-filter: blur(12px)`, subtle border + hover lift
- Forms: `max-width: 600px`, inputs `border-radius: 10px–12px`

## Responsive breakpoints
| Breakpoint | Usage |
|------------|-------|
| `<=768px` | Tablet: sidebar collapses, grid reflow |
| `<=480px` | Mobile: tighter padding, single-column grids |
| `<=360px` | Small mobile: reduced font sizes |
| `orientation: landscape` + `max-height: 500px` | Small landscape tweaks |
| `hover: none` + `pointer: coarse` | Touch: increased min tap targets (38–48px) |
| `prefers-reduced-motion: reduce` | Disable most animations |

## Component patterns

### Buttons
- **Primary:** `--blue` gradient background, navy text, bold weight, border-radius 12–14px
- **Secondary:** transparent/`--card-bg` with `--card-border` border, muted text
- **Danger (Settings):** `rgba(239,68,68,0.12)` background, red text/border
- **Pill tabs:** `border-radius: 100px`, active state uses colored low-opacity bg
- **Review (Anki):** Colored pill buttons — Again (red), Hard (amber), Good (blue), Easy (emerald)
- **Hover:** translateY(-1px to -4px) lift, enhanced shadow
- **Touch:** `min-height: 38px–48px` on touch devices

### Cards
- Background: `--card-bg`, border: `--card-border`, border-radius: 16–24px
- Top accent bar via `::before` pseudo-element (2–3px gradient)
- Hover: `translateY(-2px to -4px)`, shadow increase
- List cards (sessions): 3px left border accent

### Forms
- Labels: 11px uppercase, `--mist` color, 0.08em letter-spacing
- Inputs: `--input-bg`, `--input-border`, border-radius 10–12px
- Focus: blue border + subtle ring shadow
- Checkboxes: custom style with label gap

### Navigation (sidebar)
- Fixed 260px left, `backdrop-filter: blur(16px)`, `--card-bg` background
- Active nav item: `--blueL` bg, blue text, inset box-shadow
- Mobile: hidden off-screen (`translateX(-100%)`), toggled via overlay

### Toggle switch
- Width 44px, height 24px
- Track: `--toggle-bg`, knob: `--toggle-knob`
- Checked: `--blue` track, knob slides 20px right

### Animations
- `floatIn` — scale+fade for floating timer
- `breathe` / `bounce` — loading screen dots
- `treeGrow` / `treeSway` — Pomodoro forest
- `twinkle` — stars on Pomodoro page
- `shimmer` — progress bar loading
- `fadeIn` (0.4s ease) — settings page
- `slideDown` (0.25s ease) — settings accordion
- `toastIn` (0.3s ease-out) — Anki toast
- `ringPulse` (2s) — loading screen ring
- `playPulse` (2s) — Pomodoro play button
- Motion respected: `prefers-reduced-motion: reduce` disables most animations

### Page pattern
Each page component:
- Wrapper `<div className={styles.page}>` for positioning
- Header with `<h1>` (`--title` class: `DM Serif Display`, `clamp(24px, 4vw, 36px)`)
- Optional subtitle `<p>` (`--sub` class: 14px, `--mist` color)
- Content grid/list/form below

## Page-specific conventions

### Pomodoro
- Full-page ambient background with radial gradients + star particles
- 320px circular SVG ring timer with gradient stroke + glow
- Forest visualization with tree components per completed pomodoro
- Mode-based color: study=blue, break=emerald, long=indigo

### Anki
- Self-contained CSS module (no shared `Page.module.css`)
- Deck grid (`auto-fill, minmax(220px, 1fr)`), card list, review mode
- Stats pills row, progress bars on decks
- Status badge colors: due=red, new=indigo, later=muted, learning=amber

### Settings
- Max-width 780px, accordion sections with `sectionToggle`/`sectionContent`
- Theme picker with dark/light preview swatches
- Danger zone with red styling
- `fadeIn` entrance animation

### Auth (Login/Signup/ResetPassword)
- Centered card layout (max-width 440px) via `AuthLayout.css`
- Background blob decorations, back button top-left
- Shared CSS class names (not CSS Modules): `auth-page`, `auth-card`, etc.

### Landing
- Full marketing page: nav, hero, features grid, how-it-works steps, pricing, CTA, footer
- Decorative background blobs
- Pricing cards with `--plan-color` per-plan theming
