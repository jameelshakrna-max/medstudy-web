# MedStudy OS — Agent Guide

## Stack
- **Frontend:** React 18 + Vite 5 (SPA), CSS Modules + CSS custom properties
- **API:** Vercel serverless (edge + nodejs runtime), routed via `api/` directory
- **DB:** Turso (SQLite edge) for flashcard data + Supabase (auth, profiles, push, study_sessions, uworld_blocks)
- **PWA:** Service Worker at `public/sw.js` (cache: `medstudy-v3`), manifest at `public/manifest.json`

## Commands
| Command | Action |
|---------|--------|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Vite production build |
| `npm run preview` | Preview production build |
| `turso db shell <db> < api/migrations/001_add_indexes.sql` | Apply Turso indexes |

No test, lint, typecheck, or format commands exist. Do not add one without asking.

## Env vars (infer from code, never commit)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase client (frontend)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Supabase admin (API/cron)
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — Turso edge DB
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — Web push notifications

## Architecture notes
- Frontend entry: `src/main.jsx` → `src/App.jsx`. Auth (`AuthContext`) and Pomodoro (`PomodoroContext`) wrap the entire app.
- Protected routes use `<ProtectedRoute>` (redirects to `/login`). Public routes use `<PublicRoute>` (redirects to `/dashboard`).
- All API calls from the frontend go to `/api/*` and include `Authorization: Bearer <supabase-session>` via `apiGet`/`apiPost`/`apiPut`/`apiDel` helpers in `Anki.jsx`.
- API auth (`api/_auth.js`) verifies Supabase JWT via `jose` (JWKS). The `getUser(req)` helper returns `{ id, email, role }` or `null`.
- Turso access pattern differs across API files: `api/decks/*` and `api/flashcards/[id].js` use `@libsql/client/web` with edge runtime; `api/flashcards/index.js` uses raw HTTPS fetch to Turso REST API with nodejs runtime; `api/import/apkg.js` uses `@libsql/client` (not `/web`) with nodejs runtime.
- Theme persisted in localStorage key `medstudy-theme`. Applied before React mount in `main.jsx`.
- SW registers on first user gesture. VAPID key sent to SW via `postMessage`. Push subscription triggers on click/touch/keydown.
- FSRS spaced repetition uses `fsrs.js` library. All scheduling logic runs client-side in `Anki.jsx`.
- APKG import runs in browser (client `src/lib/apkgParser.js`) using `jszip` + `sql.js` + `/sql-wasm.wasm`.

## Style conventions
- CSS Modules: `ComponentName.module.css`, imported as `s` or `styles`.
- Global CSS vars in `src/index.css` (dark/light themes via `[data-theme="light"]`).
- Emoji icons in nav labels (Layout.jsx).
- No TypeScript, no ESLint config, no Prettier config.

## Data flow
- `anki_decks` + `anki_cards` → Turso (API routes). CRUD via `/api/decks` and `/api/flashcards`.
- `study_sessions`, `uworld_blocks`, `profiles`, `push_subscriptions` → Supabase (direct from frontend via `@supabase/supabase-js`).
- Push notification scheduling: PomodoroContext → `/api/push/schedule` → `pending_notifications`. Cron: `api/cron/notify.js` polls pending and sends via `web-push`.

## Design system
Refer to `DESIGN.md` for color tokens, typography, components, and responsive breakpoints.
