-- ════════════════════════════════════════════════════════════
-- TASK 11 — Migration 18
-- Flashcard deck-mapping mutation idempotency table.
-- Requires Migration 17 to be applied first.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flashcard_deck_mapping_mutations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_fdmm_user ON flashcard_deck_mapping_mutations(user_id);
CREATE INDEX IF NOT EXISTS idx_fdmm_created ON flashcard_deck_mapping_mutations(created_at);
