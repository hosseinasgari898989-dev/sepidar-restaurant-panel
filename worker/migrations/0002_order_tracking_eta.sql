-- سپیدار | پیگیری امن سفارش مشتری و زمان تخمینی آماده‌سازی
-- این مهاجرت فقط ستون‌های جدید اضافه می‌کند و داده‌های فعلی سفارش‌ها را حذف یا بازنویسی نمی‌کند.

ALTER TABLE orders ADD COLUMN tracking_token_hash TEXT;
ALTER TABLE orders ADD COLUMN accepted_at INTEGER;
ALTER TABLE orders ADD COLUMN estimated_ready_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_rest_eta
  ON orders(restaurant_id, estimated_ready_at);
