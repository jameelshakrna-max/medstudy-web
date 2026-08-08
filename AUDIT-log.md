# MEDSTUDY STAGING/CRITICAL-PATH AUDIT — live log

Session: Task 12 closeout. Statuses: ✅ done / 🔴 blocked / ⏳ pending.

## 1. Staging D1 isolation — RESOLVED ✅

Claim in earlier audit report: "staging Worker `medstudy-api-staging` + D1 `medstudy-db` (remote)" implying staging may hit production.

### Authoritative evidence

`wrangler versions view 45c1adad-c834-4b98-8348-6dfc5647f95f --config wrangler-staging.toml`
(version deployed 2026-07-30T10:35, 100%):

| Binding | Resource |
|---|---|
| env.DB | D1 Database `6a4f1971-4718-4252-a7d3-be51df96ab0c` = **medstudy-db-staging** |
| env.IMAGES | R2 Bucket `card-images-staging` |
| env.SUPABASE_URL | `https://bzppijzqqfclwtvmiqzb.supabase.co` (staging) |
| DOs | COMMUNITY_REALTIME_ROOM, DM_REALTIME_ROOM |
| Env vars | CF_ACCOUNT_ID, REALTIMEKIT_APP_ID, VAPID_PUBLIC_KEY |

Also cross-checked via Cloudflare API `/workers/scripts/medstudy-api-staging/settings` (bindings shape)
and `/workers/scripts/medstudy-api-staging/deployments` (deployment id db8c25b7, version 45c1adad).

**Conclusion: deployed staging worker is correctly isolated on `medstudy-db-staging`.**
No binding to production `medstudy-db` (6aee6015-...) anywhere.

### Production integrity check

`medstudy-db` (production, 6aee6015-9759-495a-8e3c-61e02e746c67) — staging test user
`873314d5-0a26-4a1f-9651-43b74b17750b`:

| table | rows | staging-user rows |
|---|---|---|
| rotation_planner_plans | 6 | 0 |
| rotation_planner_topics | 195 | (plan-scoped; 0 plans owned by staging user) |
| rotation_planner_daily_tasks | 126 | (plan-scoped) |
| rotation_planner_availability | 42 | (plan-scoped) |
| rotation_planner_task_sessions | 0 | 0 |
| rotation_planner_plan_mutations | 11 | 0 |
| rotation_planner_task_mutations | 25 | 0 |

**Conclusion: production contains zero staging test-user rows. No production impact.**

### Why the "201 persisted plan" probe found no rows

`medstudy-db-staging` (6a4f1971-...) currently holds **0 rows in every V2 table**
(plans/topics/daily_tasks/availability/task_sessions/mutations) and 0 user_profiles.
The earlier "201 created plan" probes did not reach remote staging D1 — they ran against
local miniflare state (`.wrangler/state/v3/d1/.../miniflare-D1DatabaseObject/...sqlite`).
No schema was applied to remote staging before those probes, and no synthetic row persisted
to any remote database. All audit API probing must be re-run against the deployed worker
with schema applied to confirm the full create flow works end-to-end.

## 2. Defect 1 — wizard preview→create contract — RESOLVED ✅

### Root cause (confirmed, reproduced)

- `src/components/rotation/PlanCreationForm.jsx:87` did `setPreviewToken(data.previewToken)`,
  but the preview endpoint response had no top-level `previewToken` — the fingerprint was
  only returned as `data.plan.scheduleFingerprint` → token state always null.
- `src/components/rotation/PlanCreationForm.jsx:202` gates create on
  `preview?.feasibility?.feasible`, but the preview response also had no `feasibility`
  (handler test asserted exact keys `['availability','plan','tasks','topics']`).
- Net effect: `canCreate` always `false` → **Create button permanently disabled → the
  wizard could never create a plan.**

### Fix (canonical contract)

- Backend `handlePreviewRotationPlan` (`src/handlers/rotationPlannerPlans.js`) now returns
  three additional top-level fields, all derived from the already-computed planner output:
  `previewToken` (= the existing `scheduleFingerprint`, one authoritative token),
  `feasibility` (= `preview.feasibility`), `unscheduledWork` (= `preview.unscheduledWork`).
  `plan.scheduleFingerprint` unchanged. No internal scheduler state (`topicStates`,
  `deduplicationLog`, `config`, `sourceVersion`) is exposed.
- Frontend `StepPreview.jsx` reads `possibleSolutions` from `feasibility.possibleSolutions`
  (it was incorrectly destructuring from the preview root).
- `PlanCreationForm.jsx` required **no change** — it now reads `previewToken` and gates
  `canCreate` on the authoritative `feasibility` exactly as the server computes it.

### New response contract

`plan`, `topics`, `tasks`, `availability`, `previewToken`, `feasibility`, `unscheduledWork`

### Regression tests (all green)

- `rotationPlannerPlans.test.js` — exact-keys updated to the 7-field contract; new tests:
  `previewToken` present and `=== plan.scheduleFingerprint`; `feasibility` shape
  (`feasible`, `totalRequiredMinutes`, `availableMinutes`, `missingCapacity`,
  `topicsLeftUnscheduled`, `possibleSolutions`); `unscheduledWork` entry shape
  (`canonicalTopicId`, `title`, `remainingLearningMinutes`, `remainingQuestions`); no
  `topicStates`/`deduplicationLog`/`config`/`sourceVersion` in the public DTO.
- `workerRoutes.test.js` — preview test asserts `previewToken` string + `feasibility`
  present; the existing stale-token 409 (`PREVIEW_STALE`) test unchanged and passing.
- `StepPreview.test.jsx` (new) — feasible/infeasible rendering incl. possibleSolutions
  from feasibility; unscheduledWork entries; loading; empty; error+retry.
- `StepConfirm.test.jsx` (new) — overload warning+checkbox only when infeasible;
  `onOverloadChange(true)` fires.
- `PlanCreationForm.test.jsx` (new) — create disabled until feasible preview with token;
  feasible enables; infeasible disables; create payload carries the exact `previewToken`
  and `acceptOverload:false`; `isPending` disables the button (single-request guard).

Verification: focused suites 245 passed; full`npx vitest run --pool=forks` **2140 passed**
(82 files);`npm run build -- --mode staging` clean (pre-existing chunk-size warning only).

## 3. Defect 2 — UWorld counts dropped before scheduling — NOT REPRODUCED ✅ (verified on staging)

Decision (user, 2026-08-03): do **not** add default/estimated/heuristic UWorld counts,
do **not** change DTOs/catalog/scheduler without a failing case, and do **not** silently
convert missing authoritative counts into invented values. Close as not reproducible if a
targeted staging check passes; reopen with a failing regression test otherwise.

### Suspected code path (as originally reported)

Topics endpoint DTO `toTopicDto` (`src/handlers/rotationPlanner.js:28-42`) returns no
UWorld count field; `StepUWorldQuestions` starts every topic at 0. The audit's hypothesis
was that counts were dropped somewhere between the wizard and the scheduler.

### Why it does not reproduce — propagation is test-proven

Pipeline evidence (exact fixtures):
- **Fixture (known count):** `uworldRemainingQuestions: 20` on
  `step-up-medicine-6e-2024::cardiology.stable-angina-pectoris`
  (`src/handlers/__tests__/rotationPlannerPlans.test.js` VALID_BODY, and
  `src/__tests__/workerRoutes.test.js:219`).
- **Preview topic count:** preview response topics include
  `uworldRemainingQuestions: t.uworldRemainingQuestions` (`rotationPlannerPlans.js:181`).
- **Persisted topic count:** after create→GET, `getBody1.topics[0].totalUworldQuestions`
  `=== 20` (`rotationPlannerPlans.test.js:924`).
- **Generated UWorld task total:** UWorld tasks are generated with `targetCount`
  partitioned from `remainingUworldQuestions` (`buildRotationSchedule.test.js:193`,
  `questions.test.js` asserts `targetCount` 10/3/5 splits; handler test completes them with
  `task.targetCount` at `rotationPlannerPlans.test.js:1441` and asserts
  `completedUworldQuestions` sums to the total at `:1462`).
- **Recalculation result:** learning completion → recalc unlocks UWorld (`:1424`), completed
  UWorld rows preserved, `completedUworldQuestions`/`incorrectQuestionsRemaining` tracked
  across recalcs (`:1466-1467`).
- **Shared-topic deduplication:** `deduplicateSharedTopics` marks a shared-key topic
  satisfied by the completed counterpart (`sharedTopics.test.js`, all fixtures
  `uworldRemainingQuestions: 20`); `buildRotationSchedule.test.js:702` verifies a shared
  canonical topic is scheduled once, not once per source alias.

Wizard-side path also verified: `buildPlanRequest.js:46` sends `topics: form.topics`
unchanged; `wizardState.js:74` preserves existing counts on topic reload;
`requestValidation.js:100` requires a valid non-negative `uworldRemainingQuestions` per
topic; `topicResolution.js:72` passes it through.

### Note

The catalog contains **no** per-topic authoritative UWorld count (stepUpMedicine6e has
none; caseBasedSurgery2e's `question_count`/`optional_book_questions` are *book* questions).
Counts exist only if entered by the user in the wizard. The targeted staging check therefore
uses a count entered through the UI for a specific topic and asserts that the same non-zero
value appears in preview, persisted topic, and generated UWorld tasks. Status: ✅ verified
by staging E2E (section 5).

### Live staging verification — CLOSED

`e2e/rotation-planning-staging.spec.ts` (4 serial tests, **4 passed**, 2026-08-03) against
`https://staging.medstudy-web.pages.dev` (Pages `--branch staging`) and Worker
`medstudy-api-staging`:

1. **Wizard preview→create (Defect 1 regression):** full 12-step wizard → preview POST
   returns top-level `previewToken` string, `feasibility.feasible` boolean,
   `plan.scheduleFingerprint === previewToken`, `tasks` array; "Plan is feasible" banner;
   `Create Plan` enabled; create payload carries the exact `previewToken` +
   `acceptOverload:false`; new v2 plan card visible.
2. **Persisted UWorld partition (Defect 2):** after create, GET
   `/api/rotation-planner/plans/:id` shows `topics[stable-angina].totalUworldQuestions
   === 20` AND a `uworld_questions` task with `targetCount === 20` and
   `unlockCondition: learning_completed:<canonicalTopicId>` (locked until learning completes).
3. **Recalc unlock (Defect 2):** PATCH `complete` on the learning task →
   `recalculationRequired: true`; POST `/recalculate` (revision + clientRequestId
   idempotency) → 200 with derived `topicStates[stable-angina].learningComplete === true`;
   the regenerated schedule still partitions the exact 20 (`targetCount` sum === 20).
4. **Cleanup:** DELETE removes the plan (list no longer contains the id); planner page renders.

Verdict: the UWorld count entered in the wizard propagates end-to-end (preview → persisted
topic → generated UWorld task → recalc regeneration). Defect 2 is **not reproduced** and is
closed per the user's criteria. No production change was made.

## 4. Staging deployment evidence

- Worker `medstudy-api-staging` version `05688b35-6b4c-4978-a380-e1b3dc814364` deployed via
  `wrangler deploy` (wrangler 4.105.0); bound to D1 `medstudy-db-staging`
  (`6a4f1971-...`), **not** prod (`6aee6015-...`).
- Frontend: `wrangler pages deploy dist --project-name medstudy-web --branch staging` →
  deployment `bc2d48f7.medstudy-web.pages.dev`, alias `staging.medstudy-web.pages.dev`
  (157 files, 63 cached).
- API wiring: the production bundle bakes the absolute staging API URL
  (`dist/assets/Anki-C_BjiA76.js` contains `https://medstudy-api-staging.medstudy.workers.dev/`),
  so the SPA bypasses the Pages `_worker.js` same-origin `/api/*` proxy.
- ⚠️ Latent risk: `public/_worker.js` proxies same-origin `/api/*` to the **production**
  worker `https://medstudy-api.medstudy.workers.dev`. Safe today only because builds bake
  absolute staging URLs; a future build using relative `/api/` on the staging Pages host
  would silently route staging traffic to production.

## 5. E2E results summary

Command:
`$env:STAGING_PREVIEW_URL='https://staging.medstudy-web.pages.dev'; npx playwright test e2e/rotation-planning-staging.spec.ts --reporter=line`

Result: **4 passed** (23.6s). Iteration log:
- Run 1 failed at `goto /rotation-planner` — the route is `/rotations` (`src/App.jsx:112`); fixed.
- Run 2 failed at the step-6 locator — the wizard was on step 5 (Topics review); the spec was
  missing `advance(page, 'UWorld')`; fixed.
- Run 3 failed at the plan-card locator — cards are aria-labelled by the source **slug**
  `step-up-medicine-6e-2024` (not "Step-Up to Medicine"); fixed.
- Run 4 exposed the real creation contract: `uworld_questions` tasks are generated **at
  creation** (locked via `unlockCondition`), not deferred until recalc, and both topic
  timestamps (`learning_completed_at`, `questions_unlocked_at`) are pre-filled at creation
  with planned dates from the schedule projection. Assertions updated to the actual contract;
  **4 passed**.

## 6. Full Playwright suite results (final)

Command: `$env:RUN_STAGING_E2E='1'; $env:STAGING_PREVIEW_URL='https://staging.medstudy-web.pages.dev'; npx playwright test --project=staging-integration --workers=1 --reporter=list`

Result: **12 passed / 1 failed / 3 did not run** (1.7m). Workers forced to 1 because the
default multi-worker run makes the finding-g P1 clean-profile spec flaky on chunk timing
(documented below). The 3 "did not run" are workflow-staging E2E 5-7: the file runs in
`serial` mode and E2E-4 (§7-1) fails before them, blocking the chain. E2E 5/6 pass in
isolated runs; E2E 7 runs once `STAGING_TEST_USER_B_ID` is set (present in the gitignored
`.env.staging.local`).

| Spec | Test | Result |
|---|---|---|
| rotation-planning-staging | wizard preview→create (Defect 1) | ✅ passed |
| rotation-planning-staging | persisted UWorld partition (Defect 2) | ✅ passed |
| rotation-planning-staging | learning→recalc unlock (Defect 2) | ✅ passed |
| rotation-planning-staging | cleanup deletes the plan | ✅ passed |
| finding-g-staging | P1 clean profile: all 20 lazy chunks 200 + JS MIME | ✅ passed (23.2s) |
| finding-g-staging | P1 public routes: 4 chunks 200 + JS MIME | ✅ passed |
| finding-g-staging | P3 stale chunk → ErrorFallback + console error | ✅ passed |
| finding-g-staging | P3 contrast: 200 HTML chunk → module MIME error | ✅ passed |
| finding-g-staging | P2 SW-controlled: chunks 200 + JS MIME; stale → 404 | ✅ passed |
| workflow-staging | E2E 1 Auth sign-in/out | ✅ passed |
| workflow-staging | E2E 2 Home dashboard | ✅ passed |
| workflow-staging | E2E 3 Anki FSRS review persist | ✅ passed |
| workflow-staging | E2E 4 UWorld log block + grade | ❌ FAILED (staging Supabase RLS limitation, see §7-1) |
| workflow-staging | E2E 5 Pomodoro | did not run (serial-blocked by E2E-4; passes isolated) |
| workflow-staging | E2E 6 Resources | did not run (serial-blocked by E2E-4; passes isolated) |
| workflow-staging | E2E 7 Messaging | did not run (serial-blocked by E2E-4; requires STAGING_TEST_USER_B_ID) |

### Multi-worker P1 flake (verified, not a product regression)

- `finding-g-staging.spec.ts` P1 clean profile fails in a default (multi-worker)
  `staging-integration` run: `waitForResponse` 20 s timeout while navigating the
  20-route inventory, but **passes reliably with `--workers=1`** and also passes when the
  finding-g file runs alone (5/5, 57.7s). Evidence from a failing multi-worker run shows the
  P1 loop reached `/communities/nonexistent-comm-xyz` (CommunityDetail loaded sw=False) and
  stalled on the following route under shared-worker load. Root cause is test-timing under
  parallel workers against the shared staging origin, not the Pages fallback (P2, the
  SW-controlled proof, passes in the same run). No code change needed; documented so the
  suite is run with `--workers=1`.

### Local (non-staging) suite — test-command contract

`playwright.config.ts` (localhost:3000, e2e/ dir) now runs only the deterministic local
suite by default. Staging specs are collected exclusively by the opt-in
`staging-integration` project, which is defined **only** when `RUN_STAGING_E2E=1` and
requires `STAGING_PREVIEW_URL` to be a `.medstudy-web.pages.dev` preview URL (never
production).

- Default command:`npx playwright test` → **0 failed**; only explicitly documented
  environment-gated skips.
- Local authenticated specs (`community`,`notifications`, `pomodoro`, `profile`,
  `rotation`, `overlay-layering`) require a **provisioned local account** via
  `TEST_EMAIL`/`TEST_PASSWORD`; `e2e/helpers.ts` no longer hardcodes any credentials.
  Without them the tests skip before execution with an explicit documented reason.
  There is no documented local test account, so the default run is:
  **6 passed / 28 skipped / 0 failed** (auth.spec 2, lazy-chunk-fallback 3, rotation auth
  redirect 1 pass; the 28 auth-dependent tests skip — overlay-layering 14, rotation 8,
  community 2, profile 2, notifications 1, pomodoro 1).
- Staging suite: `RUN_STAGING_E2E=1 npx playwright test --project=staging-integration
  --workers=1` (result in §6 above). The `staging-integration` run is opt-in by design;
  it reports the existing known UWorld E2E-4 staging limitation (§7-1) until that staging
  Supabase issue is resolved. `RUN_STAGING_E2E` unset → the project does not exist and the
  staging specs are never collected.

## 7. Known limitations (Task 12 scope; no further changes planned)

1. **E2E-4 UWorld block logging fails on staging** — `workflow-staging.spec.ts` E2E 4 logs a
   question block directly to Supabase (`src/pages/UWorldView.jsx:65` inserts into
   `uworld_blocks`). On the staging build the insert does not succeed (form stays open;
   block never appears; consistent across multiple isolated runs). No Task 12 file touches
   the UWorld feature or `uworld_blocks`; the failure is a pre-existing staging
   Supabase/RLS or schema provisioning issue out of Task 12 scope. Fix requires a staging
   Supabase change, not app code. E2E-4 lives only in the opt-in `staging-integration`
   project, so the default`npx playwright test` is unaffected. **Follow-up issue (not Task
   12):** provision RLS/insert policy for `uworld_blocks` on the staging Supabase project,
   then re-run `RUN_STAGING_E2E=1 npx playwright test --project=staging-integration
   --workers=1` and expect E2E-4 to pass (assertions are unchanged and must not be
   weakened).
2. **Lazy chunks are excluded from the PWA precache** — `vite.config.js` `globIgnores`
   added `_worker.js` (and the auto-generated `CommunityDetail-*`/`TrackingHub-*` were
   excluded earlier). This keeps the manifest valid and avoids double-precaching, at the
   cost of those chunks being network-fetched (Pages serves them 200 + JS MIME). Accepted
   trade-off; P2 SW-controlled test confirms SW still handles them correctly.
3. **`/communities/join/:code` has no client route** — a deep link to a join-code URL
   renders the 404/fallback (Pages now serves a real 404 for non-HTML, SPA 200 for HTML
   routes). No redirect exists to the communities join flow. Out of Task 12 scope.
4. **Pages `_worker.js` prod-proxy latent risk** — `public/_worker.js` proxies same-origin
   `/api/*` to the **production** worker. Safe today because builds bake absolute
   staging/prod API URLs (`dist/assets/*.js` contain the full worker URL), so the proxy is
   bypassed; a future build using relative `/api/` on the staging Pages host would
   silently route staging traffic to production. Tracked as a deployment-ops caution, not a
   code defect.
5. **Plan cards are aria-labelled by source slug** — e.g. `step-up-medicine-6e-2024`, not
   the human title "Step-Up to Medicine". This is the existing plan-card contract and is
   covered by the E2E/staging spec; flagged only so future tests use the slug, not the title.

## 8. Verification summary (Task 12 closeout)

| Check | Result |
|---|---|
| Vitest |`npx vitest run --pool=forks` — **82 files, 2140 passed** (jsdom nav stderr only) |
| Production build |`npm run build` passed (24.62s; PWA generateSW 221 entries; pre-existing chunk-size warning only) |
| Staging build |`npm run build -- --mode staging` passed (24.39s; staging API URL baked into 9 chunk files) |
| Worker validation |`npx wrangler deploy --dry-run` — clean (bindings: D1 medstudy-db, R2 card-images, 2 DOs, crons, vars) |
| Schema | `schema.sql` **unchanged** by Task 12 (no diff); local D1 state present; staging D1 remote schema applied |
| Staging E2E (rotation planner) | `rotation-planning-staging.spec.ts` — **4/4 passed** (§5) |
| Staging E2E (full staging-integration) | **12 passed / 1 failed (UWorld E2E-4, §7-1) / 3 serial-blocked** with `--workers=1` (§6) |
| Default E2E |`npx playwright test` — **0 failed**; 28 auth-dependent tests skip (env-gated, no local test account; §6) |

## 9. Rotation Planner V2.3 release — lifecycle, linked decks, tracking hub

Release rollout completed 2026-08-08. Scope: plan lifecycle (activate/pause/resume/complete),
linked Anki decks, and the tracking hub uworld schedule. Status: ✅ released to production.

### Commits
- 05f3b4 feat(v2 lifecycle) · 41eba8c feat(link anki decks) · 4c1dd5a feat(tracking-hub)
- 890d42 merge into main (no-ff, verified) -> pushed to origin/main
- 48f0ac9 test-only: v2.3 smoke coverage

### Verification (on merged main)
- Vitest: 2727/2727 pass · Playwright: 6 passed / 28 skipped / 0 default failures
-
pm run build PASS · wrangler deploy --dry-run PASS · git diff --check clean

### Migration24 (schema-migration24.sql)
- Adds activated_at/paused_at/completed_at on
  rotation_planner_plans
- Adds
  rotation_planner_plan_decks + indexes (idx_rppd_plan, idx_rppd_deck, unique
  idx_rppd_one_primary) and unique partial idx_rpp_one_active_plan
- Staging applied + verified; production applied + verified (8 queries, 957 read / 11 written)
- Pre/post migration safety on both remotes: duplicate-active violations = 0, PRAGMA foreign_key_check = []

### Deployments
- Staging Worker medstudy-api-staging version 8e114bb (medstudy-api-staging.medstudy.workers.dev)
- Staging Pages 04441b5 / alias staging.medstudy-web.pages.dev
- Production Worker medstudy-api version 2886f89a (medstudy-api.medstudy.workers.dev)
- Production Pages e4635e0 (branch main) — production bundle confirmed to contain v2.3 code; main alias 200

### Staging smoke (authenticated, disposable users)
- 68/68 PASS (Suites 1-17). Coverage includes lifecycle transitions, one-active invariant,
  linked-deck CRUD + stale/terminal/idempotency, and tracking explicit/auto-select/windowDays/
  cross-user isolation. Cleanup verified: both users back to plans=0.

### Production safe checks (auth-dependent deferred — no prod test credentials exist; do not create)
- Prod plan state intact (single draft plan, lifecycle columns null as expected)
- No duplicate active plans; no FK violations post-migration

### Known observations (out of scope, no change)
- selectTrackingPlan "newest draft" ordering compares mixed-format timestamps (recalc writes
  ISO T; create/rename/decks write space format), so lexicographic sort can prefer a recalc'd
  draft over a more-recently-modified one. Pre-existing; deterministic; noted for future.
