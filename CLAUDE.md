# MedStudy OS — Agent Guide

## Stack
- **Frontend:** React 18 + Vite 5 (SPA), CSS Modules + CSS custom properties
- **API:** Cloudflare Worker (`medstudy-api`, `src/worker.js`) with D1 + R2 bindings
- **DB:** Cloudflare D1 (SQLite edge) for flashcard/FSRS data + Supabase (auth, profiles, push, study_sessions, uworld_blocks)
- **PWA:** Service Worker at `public/sw.js` (cache: `medstudy-v3`), manifest at `public/manifest.json`

## Commands
| Command | Action |
|---------|--------|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Vite production build |
| `npm run preview` | Preview production build |
| `wrangler deploy` | Deploy API Worker |
| `wrangler pages deploy` | Deploy frontend to Cloudflare Pages |
| `wrangler d1 execute medstudy-db --file=./schema.sql` | Apply DB schema locally |
| `wrangler d1 execute medstudy-db --remote --file=./schema.sql` | Apply DB schema to production |

No test, lint, typecheck, or format commands exist. Do not add one without asking.

## Env vars (infer from code, never commit)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase client (frontend)
- `SUPABASE_URL` — set as `[vars]` in `wrangler.toml` or secret for API Worker
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — Web push notifications

## Architecture notes
- Frontend entry: `src/main.jsx` → `src/App.jsx`. Auth (`AuthContext`) and Pomodoro (`PomodoroContext`) wrap the entire app.
- Protected routes use `<ProtectedRoute>` (redirects to `/login`). Public routes use `<PublicRoute>` (redirects to `/dashboard`).
- All API calls from the frontend go to `/api/*` and include `Authorization: Bearer <supabase-session>` via `apiGet`/`apiPost`/`apiPut`/`apiDel` helpers in `Anki.jsx`.
- API auth (`src/_auth.js`) verifies Supabase JWT via `jose` (JWKS). Call `createAuth(env)` to get a `verifyAuth(token)` function.
- All API routes are in a single Cloudflare Worker (`src/worker.js`). D1 accessed via `env.DB.prepare()`. Images served from R2 via `env.IMAGES`.
- Theme persisted in localStorage key `medstudy-theme`. Applied before React mount in `main.jsx`.
- SW registers on first user gesture. VAPID key sent to SW via `postMessage`. Push subscription triggers on click/touch/keydown.
- FSRS spaced repetition uses `fsrs.js` library. All scheduling logic runs client-side in `Anki.jsx`.
- APKG import runs in browser (client `src/lib/apkgParser.js`) using `jszip` + `sql.js` + `/sql-wasm.wasm`.

## Style conventions
- CSS Modules: `ComponentName.module.css`, imported as `s` or `styles`.
- Global CSS vars in `src/index.css` (dark/light themes via `[data-theme="light"]`).
- No TypeScript, no ESLint config, no Prettier config.

## Data flow
- `flashcards`, `fsrs_parameters` → D1 (Worker API routes). CRUD via `/api/flashcards` and `/api/decks`.
- `study_sessions`, `uworld_blocks`, `profiles`, `push_subscriptions` → Supabase (direct from frontend via `@supabase/supabase-js`).
- Push notification scheduling: PomodoroContext → `/api/push/schedule` → `pending_notifications`.
- Image upload: frontend → `/api/upload-image` → R2 bucket `card-images`. Served via `/api/images/{filename}`.

## Design system
No settled design system yet. Design tokens in `src/index.css`.
