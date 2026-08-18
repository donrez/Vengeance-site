-- ============================================================
-- Sunless (Vengeance) — PostgreSQL schema
-- Apply: psql -h localhost -U postgres -d ИМЯ_БД -f /путь/к/wissend.sql
-- Idempotent: safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  hwid TEXT DEFAULT '',
  subscription TEXT DEFAULT 'none',
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  role TEXT DEFAULT 'USER',
  sub_end TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS keys (
  key TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by INTEGER,
  activated_at TEXT,
  days INTEGER DEFAULT 365
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promos (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  discount INTEGER DEFAULT 0,
  outActive INTEGER DEFAULT 1,
  entActive INTEGER DEFAULT 0,
  outDate TEXT,
  days INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hwid_keys (
  key TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by INTEGER,
  activated_at TEXT,
  days INTEGER DEFAULT 365
);

CREATE TABLE IF NOT EXISTS grants (
  id SERIAL PRIMARY KEY,
  promo TEXT NOT NULL,
  media_uid TEXT,
  percent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS banned_hwids (
  hwid TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Загруженный клиент (чанки хранятся в client_chunks)
CREATE TABLE IF NOT EXISTS client_builds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  beta INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',
  username TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS client_chunks (
  build_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY (build_id, idx)
);

-- ============================================================
-- Seed
-- ============================================================

-- Админ: login coderdlc / пароль Sunless-Admin-2026  (СМЕНИ ПАРОЛЬ после первого входа)
INSERT INTO users (username, email, password_hash, salt, role)
SELECT 'coderdlc', 'admin@example.com',
       '768c2cbf441f1073ca5401e0e72d67162b759035ccdf31100db9442feddc62878de8060065bb03d728650045a0eb8a6aae1da36d233ac77fd16cf3730003ae15',
       '149306eea57936aea2864e5d8aca1cfe',
       'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'coderdlc');

-- 10 стартовых ключей активации (если таблица пуста)
INSERT INTO keys (key, days)
SELECT 'VGNC-' || upper(substr(md5(random()::text), 1, 4)) || '-' ||
       upper(substr(md5(random()::text), 1, 4)) || '-' ||
       upper(substr(md5(random()::text), 1, 4)) || '-' ||
       upper(substr(md5(random()::text), 1, 4)), 365
FROM generate_series(1, 10)
WHERE NOT EXISTS (SELECT 1 FROM keys LIMIT 1);