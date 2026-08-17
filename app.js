const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createClient } = require("@libsql/client");

const ROOT = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "vengeance123";

function makeClient() {
  return createClient({
    url: process.env.TURSO_URL || "file:" + path.join(ROOT, "data.db"),
    authToken: process.env.TURSO_TOKEN || undefined,
  });
}

let client = makeClient();

/* ================= async db helpers ================= */

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

/* ================= schema + seed ================= */

let dbReady = null;

function ensureDb() {
  if (!dbReady) {
    dbReady = (async () => {
      const pragmas = process.env.TURSO_URL
        ? ""
        : "PRAGMA journal_mode = WAL;\nPRAGMA busy_timeout = 10000;\n";
      await withRetry(() => client.executeMultiple(pragmas + `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  hwid TEXT DEFAULT '',
  subscription TEXT DEFAULT 'none',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS keys (
  key TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by INTEGER,
  activated_at TEXT
);
`));
      const count = await getOne("SELECT COUNT(*) AS c FROM keys");
      if (count && count.c === 0) {
        const insert = "INSERT INTO keys (key) VALUES (?)";
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let i = 0; i < 10; i++) {
          let key = "VGNC-";
          for (let g = 0; g < 4; g++) {
            let part = "";
            for (let j = 0; j < 4; j++) part += alphabet[crypto.randomInt(alphabet.length)];
            key += part + (g < 3 ? "-" : "");
          }
          await withRetry(() => client.execute({ sql: insert, args: [key] }));
        }
        console.log("Seeded 10 activation keys");
      }
    })();
  }
  return dbReady;
}

/* ================= helpers ================= */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    hwid: u.hwid || "",
    subscription: u.subscription || "none",
    createdAt: u.created_at,
  };
}

function deviceHwid(req) {
  const hwid = String(req.headers["x-hwid"] || "").trim();
  return hwid.length <= 64 ? hwid : "";
}

async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      const msg = String((e && e.message) || "") + " " + String((e && e.cause && e.cause.message) || "");
      if (!/fetch failed|ECONNRESET|socket hang up|ETIMEDOUT|ECONNREFUSED|network/i.test(msg)) throw e;
      try {
        client.close();
      } catch (e2) {}
      client = makeClient();
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

function dbQuery(sql, args) {
  return withRetry(() => client.execute({ sql, args: args || [] }));
}

async function authUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "auth" });
    const s = await getOne("SELECT * FROM sessions WHERE token = ?", [token]);
    if (!s) return res.status(401).json({ error: "auth" });
    const user = await getOne("SELECT * FROM users WHERE id = ?", [s.user_id]);
    if (!user) return res.status(401).json({ error: "auth" });
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
}

async function authAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "auth" });
    const s = await getOne("SELECT * FROM admin_sessions WHERE token = ?", [token]);
    if (!s) return res.status(401).json({ error: "auth" });
    req.adminToken = token;
    next();
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await ensureDb();
      await fn(req, res);
    } catch (e) {
      console.error("API error:", e && e.message, e && e.code, e && e.cause && e.cause.message);
      res.status(500).json({ error: "server" });
    }
  };
}

/* ================= app ================= */

const app = express();
app.use(express.json());
app.use(express.static(ROOT, { extensions: ["html"] }));

/* auth */

app.post(
  "/api/register",
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: "username" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "email" });
    if (password.length < 6) return res.status(400).json({ error: "password" });

    const exists = await getOne("SELECT id FROM users WHERE username = ? OR email = ?", [username, email]);
    if (exists) return res.status(409).json({ error: "exists" });

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    const info = await run("INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)", [
      username,
      email,
      hash,
      salt,
    ]);
    const token = makeToken();
    await run("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, info.lastInsertRowid]);
    const user = await getOne("SELECT * FROM users WHERE id = ?", [info.lastInsertRowid]);
    res.json({ token, user: publicUser(user) });
  })
);

app.post(
  "/api/login",
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const user = await getOne("SELECT * FROM users WHERE username = ? OR email = ?", [username, username]);
    if (!user) return res.status(401).json({ error: "bad" });

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password_hash) return res.status(401).json({ error: "bad" });

    const hwid = deviceHwid(req);
    if (user.hwid && hwid && user.hwid !== hwid)
      return res.status(403).json({ error: "hwid" });

    const token = makeToken();
    await run("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, user.id]);
    res.json({ token, user: publicUser(user) });
  })
);

app.post("/api/logout", authUser, wrap(async (req, res) => {
  await run("DELETE FROM sessions WHERE token = ?", [req.token]);
  res.json({ ok: true });
}));

app.all("/api/me", authUser, wrap(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

/* profile */

app.post(
  "/api/hwid",
  authUser,
  wrap(async (req, res) => {
    const hwid = String(req.body.hwid || "").trim();
    if (!hwid || hwid.length > 64) return res.status(400).json({ error: "hwid" });
    await run("UPDATE users SET hwid = ? WHERE id = ?", [hwid, req.user.id]);
    const user = await getOne("SELECT * FROM users WHERE id = ?", [req.user.id]);
    res.json({ user: publicUser(user) });
  })
);

app.post(
  "/api/key/activate",
  authUser,
  wrap(async (req, res) => {
    const key = String(req.body.key || "").trim().toUpperCase();
    const k = await getOne("SELECT * FROM keys WHERE key = ?", [key]);
    if (!k) return res.status(404).json({ error: "notfound" });
    if (k.used) return res.status(409).json({ error: "used" });

    const hwid = deviceHwid(req);

    const statements = [
      {
        sql: "UPDATE keys SET used = 1, used_by = ?, activated_at = datetime('now') WHERE key = ?",
        args: [req.user.id, key],
      },
      { sql: "UPDATE users SET subscription = 'lifetime' WHERE id = ?", args: [req.user.id] },
    ];
    if (hwid)
      statements.push({ sql: "UPDATE users SET hwid = ? WHERE id = ?", args: [hwid, req.user.id] });

    await withRetry(() => client.batch(statements, "write"));

    const user = await getOne("SELECT * FROM users WHERE id = ?", [req.user.id]);
    res.json({ user: publicUser(user) });
  })
);

/* admin */

app.post(
  "/api/admin/login",
  wrap(async (req, res) => {
    const password = String(req.body.password || "");
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "bad" });
    const token = makeToken();
    await run("INSERT INTO admin_sessions (token) VALUES (?)", [token]);
    res.json({ token });
  })
);

app.get("/api/admin/keys", authAdmin, wrap(async (req, res) => {
  const keys = await getAll(
    "SELECT k.key, k.used, k.activated_at, u.username AS used_by FROM keys k LEFT JOIN users u ON u.id = k.used_by ORDER BY k.used, k.key"
  );
  res.json({ keys });
}));

app.post(
  "/api/admin/keys/generate",
  authAdmin,
  wrap(async (req, res) => {
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 100);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const generated = [];
    for (let i = 0; i < count; i++) {
      let key = "VGNC-";
      for (let g = 0; g < 4; g++) {
        let part = "";
        for (let j = 0; j < 4; j++) part += alphabet[crypto.randomInt(alphabet.length)];
        key += part + (g < 3 ? "-" : "");
      }
      try {
        await run("INSERT INTO keys (key) VALUES (?)", [key]);
        generated.push(key);
      } catch (e) {}
    }
    res.json({ keys: generated });
  })
);

app.post(
  "/api/admin/keys/revoke",
  authAdmin,
  wrap(async (req, res) => {
    const key = String(req.body.key || "").trim().toUpperCase();
    const info = await run("DELETE FROM keys WHERE key = ?", [key]);
    if (info.changes === 0) return res.status(404).json({ error: "notfound" });
    res.json({ ok: true });
  })
);

app.get("/api/admin/users", authAdmin, wrap(async (req, res) => {
  const users = await getAll(
    "SELECT id, username, email, hwid, subscription, created_at FROM users ORDER BY id"
  );
  res.json({ users });
}));

app.post(
  "/api/admin/hwid/reset",
  authAdmin,
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const info = await run("UPDATE users SET hwid = '' WHERE username = ?", [username]);
    if (info.changes === 0) return res.status(404).json({ error: "notfound" });
    res.json({ ok: true });
  })
);

app.post("/api/admin/logout", authAdmin, wrap(async (req, res) => {
  await run("DELETE FROM admin_sessions WHERE token = ?", [req.adminToken]);
  res.json({ ok: true });
}));

/* fallback */

app.use((req, res) => {
  res.status(404).json({ error: "notfound" });
});

module.exports = app;
module.exports.ensureDb = ensureDb;