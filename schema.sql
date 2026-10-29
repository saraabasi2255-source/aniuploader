-- هر پیام داخل کانال آرشیو یک ردیف است (آلبوم‌ها با group_id به هم وصل میشن)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL UNIQUE,
  group_id TEXT,
  type TEXT,
  caption TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_group ON posts(group_id);

-- فایل‌هایی که باید حذف بشن (برای اینکه حتی بعد از خطا هم پاک بشن)
CREATE TABLE IF NOT EXISTS pending_deletes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  ids TEXT NOT NULL,
  warn_id INTEGER,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_at ON pending_deletes(at);
