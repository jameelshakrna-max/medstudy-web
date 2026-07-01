CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  image_url TEXT,
  tags TEXT,
  difficulty REAL DEFAULT 0,
  stability REAL DEFAULT 0,
  state INTEGER DEFAULT 0,
  interval REAL DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  last_review TEXT,
  next_review TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fsrs_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  params TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_name);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_deck ON flashcards(user_id, deck_name);
