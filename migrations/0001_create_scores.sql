-- Leaderboard scores table
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  checksum INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for leaderboard queries (top scores)
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);

-- Index for per-user queries
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, score DESC);

-- Rate-limit index: latest submission per user
CREATE INDEX IF NOT EXISTS idx_scores_user_time ON scores(user_id, created_at DESC);
