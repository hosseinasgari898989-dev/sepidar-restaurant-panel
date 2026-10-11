-- سپیدار | مدیریت توکن‌های ورود با انقضا و لغو امن
-- فقط هش توکن ذخیره می‌شود؛ مقدار خام فقط در لحظه ایجاد به مدیر نشان داده می‌شود.

CREATE TABLE IF NOT EXISTS access_tokens (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  token_prefix  TEXT NOT NULL,
  label         TEXT NOT NULL,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  role          TEXT NOT NULL CHECK (role IN ('platform_admin','owner')),
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER,
  revoked_at    INTEGER,
  last_used_at  INTEGER,
  created_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_restaurant
  ON access_tokens(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_tokens_active
  ON access_tokens(restaurant_id, revoked_at, expires_at);

-- نشست‌های ساخته‌شده با توکن مدیریتی به همان توکن متصل‌اند تا لغو توکن،
-- نشست‌های موجود را نیز فوراً بی‌اعتبار کند. نشست اضطراری bootstrap شناسه توکن ندارد.
ALTER TABLE sessions ADD COLUMN bootstrap INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN access_token_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_access_token
  ON sessions(access_token_id, revoked_at);
