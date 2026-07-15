-- ════════════════════════════════════════════════════════════
-- RESEARCH HUB (Migration 12)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS research_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  community_id TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT DEFAULT 'open',
  upvotes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  helped_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  expires_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_posts_user ON research_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_research_posts_category ON research_posts(category);
CREATE INDEX IF NOT EXISTS idx_research_posts_community ON research_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_research_posts_created ON research_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_research_posts_status ON research_posts(status);

CREATE TABLE IF NOT EXISTS research_post_tags (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE(post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_research_tags_post ON research_post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_research_tags_tag ON research_post_tags(tag);

CREATE TABLE IF NOT EXISTS research_votes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_research_votes_post ON research_votes(post_id);

CREATE TABLE IF NOT EXISTS research_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_comments_post ON research_comments(post_id);

CREATE TABLE IF NOT EXISTS research_helped_marks (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  helper_id TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  help_type TEXT NOT NULL DEFAULT 'helped',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, helper_id, help_type)
);
CREATE INDEX IF NOT EXISTS idx_research_helped_post ON research_helped_marks(post_id);
CREATE INDEX IF NOT EXISTS idx_research_helped_helper ON research_helped_marks(helper_id);

CREATE TABLE IF NOT EXISTS user_research_profile (
  user_id TEXT PRIMARY KEY,
  bio TEXT DEFAULT '',
  institution TEXT DEFAULT '',
  department TEXT DEFAULT '',
  research_interests TEXT DEFAULT '',
  orcid TEXT DEFAULT '',
  google_scholar TEXT DEFAULT '',
  researchgate TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  visibility TEXT DEFAULT 'public',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_research_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  proficiency TEXT DEFAULT 'intermediate',
  is_custom INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, skill)
);
CREATE INDEX IF NOT EXISTS idx_research_skills_user ON user_research_skills(user_id);

CREATE TABLE IF NOT EXISTS user_research_stats (
  user_id TEXT PRIMARY KEY,
  score INTEGER DEFAULT 0,
  level TEXT DEFAULT 'Beginner',
  posts_created INTEGER DEFAULT 0,
  posts_closed INTEGER DEFAULT 0,
  comments_created INTEGER DEFAULT 0,
  comments_helpful INTEGER DEFAULT 0,
  upvotes_received INTEGER DEFAULT 0,
  upvotes_given INTEGER DEFAULT 0,
  surveys_completed INTEGER DEFAULT 0,
  collaborations_joined INTEGER DEFAULT 0,
  papers_shared INTEGER DEFAULT 0,
  projects_created INTEGER DEFAULT 0,
  followers_from_research INTEGER DEFAULT 0,
  last_activity TEXT DEFAULT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_reputation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  action TEXT NOT NULL,
  reference_id TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rep_events_user ON research_reputation_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS research_bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_research_bookmarks_user ON research_bookmarks(user_id);

CREATE TABLE IF NOT EXISTS research_portfolio (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  research_type TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'other',
  status TEXT DEFAULT 'ongoing',
  specialty TEXT DEFAULT '',
  journal TEXT DEFAULT '',
  publication_date TEXT DEFAULT '',
  doi TEXT DEFAULT '',
  pmid TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  authors TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_portfolio_user ON research_portfolio(user_id);

CREATE TABLE IF NOT EXISTS research_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_reports_post ON research_reports(post_id);
