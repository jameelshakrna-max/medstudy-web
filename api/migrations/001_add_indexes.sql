-- Run against your Turso database to add performance indexes
-- turso db shell <db-name> < api/migrations/001_add_indexes.sql

CREATE INDEX IF NOT EXISTS idx_anki_cards_user_next_review ON anki_cards(user_id, next_review);
CREATE INDEX IF NOT EXISTS idx_anki_cards_user_deck ON anki_cards(user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_anki_cards_user_deck_next_review ON anki_cards(user_id, deck_id, next_review);
CREATE INDEX IF NOT EXISTS idx_anki_decks_user_id ON anki_decks(user_id);
