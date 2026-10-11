-- سپیدار | مدیریت بن نظر، پاک‌سازی اسپم و شناسه ناشناس مرورگر
-- شناسه خام هرگز ذخیره نمی‌شود؛ فقط SHA-256 روی کلید ناشناس مرورگر ذخیره می‌شود.

ALTER TABLE reviews ADD COLUMN client_key_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_client_key
  ON reviews(restaurant_id, client_key_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS review_bans (
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  client_key_hash TEXT NOT NULL,
  reason          TEXT,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  created_by      TEXT NOT NULL,
  PRIMARY KEY (restaurant_id, client_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_review_bans_expiry
  ON review_bans(restaurant_id, expires_at);

-- «سایر» برای محصولاتی است که عکس واقعی دارند؛ در کد سرور برای این دسته نبود عکس رد می‌شود.
INSERT OR IGNORE INTO categories
  (restaurant_id, id, name, emoji, color1, color2, options, removables, sort, updated_at)
SELECT id, 'other', 'سایر', '🗂️', '#cbd5e1', '#94a3b8', '[]', '[]', 9999,
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM restaurants
WHERE id = 'main';
