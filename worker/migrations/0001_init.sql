-- سپیدار | ساختار اولیه پایگاه داده مشترک (Cloudflare D1)
-- اجرا: npx wrangler d1 migrations apply sepidar-db --remote

CREATE TABLE IF NOT EXISTS restaurants (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  phone            TEXT,
  address          TEXT,
  hours            TEXT,
  about            TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paused')),
  accepting_orders INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  id            TEXT NOT NULL,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color1        TEXT,
  color2        TEXT,
  options       TEXT NOT NULL DEFAULT '[]',   -- [{t, type:'one'|'many', list:[[name, price]]}]
  removables    TEXT NOT NULL DEFAULT '[]',   -- ["بدون پیاز", ...]
  sort          INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, id)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  category_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         INTEGER NOT NULL CHECK (price >= 0),
  emoji         TEXT,
  image_url     TEXT,
  model_url     TEXT,
  meta          TEXT NOT NULL DEFAULT '{}',   -- همان خانه هفتم آیتم در سایت مشتری (b, f, d, s)
  removables    TEXT,                         -- NULL = همه مواد قابل حذف دسته
  active        INTEGER NOT NULL DEFAULT 1,
  available     INTEGER NOT NULL DEFAULT 1,
  archived      INTEGER NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_rest ON menu_items(restaurant_id, category_id, sort);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  number        INTEGER NOT NULL,
  table_label   TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','ready','delivered','cancelled')),
  total         INTEGER NOT NULL,
  cancel_reason TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (restaurant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_orders_rest_time ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rest_status ON orders(restaurant_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  restaurant_id TEXT NOT NULL,
  item_id       TEXT,
  category_id   TEXT,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color1        TEXT,
  color2        TEXT,
  image_url     TEXT,
  qty           INTEGER NOT NULL,
  unit_price    INTEGER NOT NULL,
  line_total    INTEGER NOT NULL,
  options       TEXT NOT NULL DEFAULT '[]',   -- [{g: عنوان گروه, n: نام گزینه, p: قیمت اضافه}]
  removed       TEXT NOT NULL DEFAULT '[]',
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  actor         TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oe_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  order_number  INTEGER,
  item_id       TEXT,
  item_name     TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),  -- پنل اجازه تغییر ندارد
  comment       TEXT,
  author_name   TEXT,
  visibility    TEXT NOT NULL DEFAULT 'published' CHECK (visibility IN ('published','hidden')),
  flagged       INTEGER NOT NULL DEFAULT 0,
  flag_reason   TEXT,
  reply         TEXT,
  reply_at      INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_rest ON reviews(restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  phone           TEXT NOT NULL,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','rejected')),
  internal_note   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash       TEXT PRIMARY KEY,               -- فقط هش شناسه نشست ذخیره می‌شود
  restaurant_id TEXT NOT NULL,
  role          TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  last_seen_at  INTEGER,
  ip_hash       TEXT,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_rest ON sessions(restaurant_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id TEXT,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  detail        TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_rest ON audit_log(restaurant_id, created_at DESC);
