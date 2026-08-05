-- Migration 21: Empty-deck persistence
-- Deck creation previously echoed success without persisting any row, so an
-- empty deck never appeared in the deck list. deck_settings records a deck
-- before any flashcards exist. The unique index keeps (user_id, deck_name)
-- idempotent for INSERT OR IGNORE so double-create cannot produce duplicates.
CREATE TABLE IF NOT EXISTS deck_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_settings_user_deck
  ON deck_settings(user_id, deck_name);
