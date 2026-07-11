cont# Realtime Updates for Chat and Competitions

## Step 1 — Repo understanding (done)
- Reviewed existing Worker API routing, permissions, chat REST endpoints, competition REST endpoints.
- Reviewed current chat hook (`src/hooks/useCommunityChat.js`) which uses polling.

## Step 2 — Durable Object + endpoints scaffold
- [ ] Add Durable Object (`CommunityRealtimeRoom`) per community for all realtime (WS fanout).
- [ ] Add Worker route for WebSocket upgrade (`/api/communities/:id/ws`).
- [ ] Remove SSE-related endpoints from the plan (no SSE in v1).


## Step 3 — Emit realtime events from REST mutations
- [ ] In Worker chat mutation handlers (send/edit/delete/reaction/pin), broadcast corresponding `message:*` / `reaction:*` / `pin:*` events to the chat DO.
- [ ] In Worker competition mutation handlers (create/update/approve/reject/end/join/leave/sync/leaderboard), broadcast `competition:*` and `leaderboard:update` events to competition SSE DO.

## Step 4 — Authentication + permissions
- [ ] Validate Supabase JWT for WS/SSE connect.
- [ ] Ensure DO only broadcasts events it receives (no extra permission logic inside DO).
- [ ] Ensure Worker emits only after REST permissions succeed.

## Step 5 — Client realtime hook + integration
- [x] Implement `src/hooks/useCommunityRealtime.js` (WS chat + SSE competitions + reconnection/backoff + REST backfill).
- [ ] Update Community pages/components to use the new hook for chat and competitions.
- [ ] Keep existing polling as fallback on WS/SSE failure.


## Step 6 — Build & smoke test
- [ ] Run `npm run build`.
- [ ] Smoke test: open two tabs in same community, send/edit/delete messages and verify broadcast.
- [ ] Smoke test: open competitions tab and verify SSE events on join/end/sync.

## Step 7 — Final polish
- [ ] Add event idempotency/deduplication on client.
- [ ] Add WS heartbeat / ping and SSE keep-alive comments.
- [ ] Add minimal logging/observability for connect/disconnect and broadcast failures.

