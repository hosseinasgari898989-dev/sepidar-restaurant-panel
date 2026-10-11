-- Sepidar: highlighted customer reviews and one-vote-per-browser reactions.
-- The client identifier is hashed before persistence; raw browser IDs are never stored.
ALTER TABLE reviews ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN feature_style TEXT NOT NULL DEFAULT 'glow';

CREATE TABLE IF NOT EXISTS review_votes (
  restaurant_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  client_key_hash TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, review_id, client_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_review_votes_review
  ON review_votes(restaurant_id, review_id, vote);
