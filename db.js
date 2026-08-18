/* Universal DB layer: local SQLite (file:), Turso (libsql) or PostgreSQL.
   - DATABASE_URL starts with postgres:// or postgresql://  -> pg Pool
   - TURSO_URL set                                          -> libsql (Turso)
   - otherwise                                              -> local SQLite file data.db
*/

const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;

const mode = (() => {
  const u = String(process.env.DATABASE_URL || "");
  if (/^postgres(ql)?:\/\//i.test(u)) return "pg";
  if (process.env.TURSO_URL) return "turso";
  return "sqlite";
})();

let pgPool = null;
let libClient = null;

if (mode === "pg") {
  const { Pool } = require("pg");
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
} else {
  const { createClient } = require("@libsql/client");
  libClient = createClient({
    url: process.env.TURSO_URL || "file:" + path.join(ROOT, "data.db"),
    authToken: process.env.TURSO_TOKEN || undefined,
  });
}

function closeDb() {
  try {
    if (pgPool) pgPool.end();
    if (libClient) libClient.close();
  } catch (e) {}
}

/* translate ? placeholders to $1..$n for postgres */
function toPgSql(sql) {
  let out = "";
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "?") {
      n += 1;
      out += "$" + n;
    } else {
      out += ch;
    }
  }
  return { sql: out, n };
}

async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      const msg =
        String((e && e.message) || "") + " " + String((e && e.cause && e.cause.message) || "");
      if (!/fetch failed|ECONNRESET|socket hang up|ETIMEDOUT|ECONNREFUSED|network/i.test(msg)) throw e;
      try {
        if (pgPool) {
          await pgPool.end();
          const { Pool } = require("pg");
          pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
        }
        if (libClient) libClient.close();
      } catch (e2) {}
      if (mode !== "pg") {
        const { createClient } = require("@libsql/client");
        libClient = createClient({
          url: process.env.TURSO_URL || "file:" + path.join(ROOT, "data.db"),
          authToken: process.env.TURSO_TOKEN || undefined,
        });
      }
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

/* Execute one statement; returns { rows, columns, rowsAffected, lastInsertRowid } */
async function dbQuery(sql, args) {
  args = args || [];
  if (mode === "pg") {
    const { sql: psql, n } = toPgSql(sql);
    if (n !== args.length)
      throw new Error("Placeholder mismatch: sql has " + n + " placeholders, " + args.length + " args");
    const res = await withRetry(() => pgPool.query(psql, args));
    const columns = res.fields ? res.fields.map((f) => f.name) : [];
    return {
      rows: res.rows.map((r) => columns.map((c) => r[c])),
      columns,
      rowsAffected: res.rowCount == null ? 0 : res.rowCount,
      lastInsertRowid: 0,
    };
  }
  const r = await withRetry(() => libClient.execute({ sql, args }));
  return r;
}

/* Run multiple statements (schema DDL etc.) */
async function executeMultiple(statements) {
  if (mode === "pg") {
    const c = await pgPool.connect();
    try {
      await c.query("BEGIN");
      for (const st of statements) {
        const { sql: psql } = toPgSql(st);
        await c.query(psql, []);
      }
      await c.query("COMMIT");
    } catch (e) {
      try {
        await c.query("ROLLBACK");
      } catch (e2) {}
      throw e;
    } finally {
      c.release();
    }
    return { rowsAffected: 0 };
  }
  return withRetry(() => libClient.executeMultiple(statements.join("\n")));
}

/* Atomic batch (key activation: mark used + extend sub) */
async function batch(statements) {
  if (mode === "pg") {
    const c = await pgPool.connect();
    try {
      await c.query("BEGIN");
      for (const st of statements) {
        const { sql: psql, n } = toPgSql(st.sql);
        if (n !== st.args.length) throw new Error("Placeholder mismatch in batch");
        await c.query(psql, st.args);
      }
      await c.query("COMMIT");
    } catch (e) {
      try {
        await c.query("ROLLBACK");
      } catch (e2) {}
      throw e;
    } finally {
      c.release();
    }
    return { rowsAffected: 0 };
  }
  return withRetry(() => libClient.batch(statements, "write"));
}

async function getOne(sql, args) {
  const r = await dbQuery(sql, args);
  const row = r.rows[0];
  if (!row) return null;
  const obj = {};
  r.columns.forEach((c, i) => (obj[c] = row[i]));
  return obj;
}

async function getAll(sql, args) {
  const r = await dbQuery(sql, args);
  return r.rows.map((row) => {
    const obj = {};
    r.columns.forEach((c, i) => (obj[c] = row[i]));
    return obj;
  });
}

async function run(sql, args) {
  const r = await dbQuery(sql, args);
  return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid || 0) };
}

/* ================= schema ================= */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    hwid TEXT DEFAULT '',
    subscription TEXT DEFAULT 'none',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );`,
  `CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY,
    used INTEGER DEFAULT 0,
    used_by INTEGER,
    activated_at TEXT,
    days INTEGER DEFAULT 365
  );`,
  `CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL UNIQUE,
    discount INTEGER DEFAULT 0,
    outActive INTEGER DEFAULT 1,
    entActive INTEGER DEFAULT 0,
    outDate TEXT,
    days INTEGER DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS hwid_keys (
    key TEXT PRIMARY KEY,
    used INTEGER DEFAULT 0,
    used_by INTEGER,
    activated_at TEXT,
    days INTEGER DEFAULT 365
  );`,
  `CREATE TABLE IF NOT EXISTS grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promo TEXT NOT NULL,
    media_uid TEXT,
    percent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );`,
  `CREATE TABLE IF NOT EXISTS banned_hwids (
    hwid TEXT PRIMARY KEY,
    user_id INTEGER,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );`,
  `CREATE TABLE IF NOT EXISTS client_builds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    beta INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading',
    username TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );`,
  `CREATE TABLE IF NOT EXISTS client_chunks (
    build_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data BYTEA NOT NULL,
    PRIMARY KEY (build_id, idx)
  );`,
];

function adaptSchema() {
  if (mode === "pg") {
    return SCHEMA_STATEMENTS.map((s) =>
      s
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY")
        .replace(/BYTEA/g, "BYTEA")
    );
  }
  return SCHEMA_STATEMENTS;
}

async function ensureColumn(sql) {
  try {
    await dbQuery(sql, []);
  } catch (e) {
    /* column already exists */
  }
}

let dbReady = null;

async function initSchema() {
  if (!dbReady) {
    dbReady = (async () => {
      if (mode !== "pg") {
        await dbQuery("PRAGMA journal_mode = WAL", []);
        await dbQuery("PRAGMA busy_timeout = 10000", []);
      }
      await executeMultiple(adaptSchema());
      await ensureColumn("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'");
      await ensureColumn("ALTER TABLE users ADD COLUMN sub_end TEXT");
      await ensureColumn("ALTER TABLE keys ADD COLUMN days INTEGER DEFAULT 365");
      const count = await getOne("SELECT COUNT(*) AS c FROM keys");
      if (count && Number(count.c) === 0) {
        const insert = "INSERT INTO keys (key) VALUES (?)";
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let i = 0; i < 10; i++) {
          let key = "VGNC-";
          for (let g = 0; g < 4; g++) {
            let part = "";
            for (let j = 0; j < 4; j++) part += alphabet[crypto.randomInt(alphabet.length)];
            key += part + (g < 3 ? "-" : "");
          }
          await run(insert, [key]);
        }
        console.log("Seeded 10 activation keys");
      }
    })();
  }
  return dbReady;
}

module.exports = {
  mode,
  dbQuery,
  executeMultiple,
  batch,
  getOne,
  getAll,
  run,
  initSchema,
  closeDb,
};