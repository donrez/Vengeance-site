const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createClient } = require("@libsql/client");

const ROOT = __dirname;

const ALTCHA_SECRET = process.env.ALTCHA_SECRET || "sunless-altcha-secret-2026";
const ALTCHA_MAX_NUMBER = 100000;
const FUPAY_OFFER = "https://funpay.com/lots/offer?id=74940528";

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

async function ensureColumn(sql) {
  try {
    await dbQuery(sql, []);
  } catch (e) {
    /* column already exists */
  }
}

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
CREATE TABLE IF NOT EXISTS keys (
  key TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by INTEGER,
  activated_at TEXT,
  days INTEGER DEFAULT 365
);
`));
      await ensureColumn("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'");
      await ensureColumn("ALTER TABLE users ADD COLUMN sub_end TEXT");
      await ensureColumn("ALTER TABLE keys ADD COLUMN days INTEGER DEFAULT 365");
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

/* ================= altcha ================= */

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s, "base64");
}

function altchaChallenge() {
  const salt = b64url(crypto.randomBytes(12));
  const number = crypto.randomInt(0, ALTCHA_MAX_NUMBER + 1);
  const challenge = crypto.createHash("sha256").update(salt + number).digest("hex");
  const signature = b64url(
    crypto.createHmac("sha256", ALTCHA_SECRET).update(challenge + "." + salt).digest()
  );
  return { algorithm: "SHA-256", challenge, salt, signature, maxNumber: ALTCHA_MAX_NUMBER };
}

function altchaVerify(token) {
  if (!token || typeof token !== "string") return false;
  try {
    const p = JSON.parse(b64urlDecode(token).toString("utf8"));
    if (!p || p.algorithm !== "SHA-256" || typeof p.challenge !== "string" || typeof p.salt !== "string") {
      return false;
    }
    const number = Number(p.number);
    if (!Number.isInteger(number) || number < 0 || number > ALTCHA_MAX_NUMBER) return false;
    const digest = crypto.createHash("sha256").update(p.salt + number).digest("hex");
    if (digest !== p.challenge) return false;
    const expected = crypto.createHmac("sha256", ALTCHA_SECRET).update(p.challenge + "." + p.salt).digest();
    let sig;
    try {
      sig = b64urlDecode(p.signature);
    } catch (e) {
      return false;
    }
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function requireCaptcha(req, res, next) {
  const token = String(req.headers["cf-turnstile-token"] || req.headers["altcha-token"] || "").trim();
  if (!altchaVerify(token)) {
    return res.status(400).json({ message: "Пройдите проверку капчи" });
  }
  next();
}

/* ================= auth middleware ================= */

async function authUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Нет токена авторизации" });
    const s = await getOne("SELECT * FROM sessions WHERE token = ?", [token]);
    if (!s) return res.status(401).json({ message: "Сессия больше недействительна. Войдите заново." });
    const user = await getOne("SELECT * FROM users WHERE id = ?", [s.user_id]);
    if (!user) return res.status(401).json({ message: "Сессия больше недействительна. Войдите заново." });
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await ensureDb();
      await fn(req, res);
    } catch (e) {
      console.error("API error:", e && e.message, e && e.code, e && e.cause && e.cause.message);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  };
}

/* ================= app ================= */

const app = express();
app.use(express.json());
app.use(express.static(ROOT, { extensions: ["html"] }));

/* altcha */

app.get("/api/altcha/challenge", wrap(async (req, res) => {
  res.json(altchaChallenge());
}));

/* auth (skycore-compatible contract) */

app.post(
  "/auth/login",
  requireCaptcha,
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const user = await getOne("SELECT * FROM users WHERE username = ? OR email = ?", [username, username]);
    if (!user) return res.status(401).json({ message: "Неверный логин или пароль" });

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password_hash) return res.status(401).json({ message: "Неверный логин или пароль" });

    const hwid = deviceHwid(req);
    if (user.hwid && hwid && user.hwid !== hwid)
      return res.status(403).json({ message: "Аккаунт привязан к другому устройству" });

    const token = makeToken();
    await run("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, user.id]);
    res.json({ token, message: "Вход выполнен" });
  })
);

app.post(
  "/auth/register",
  requireCaptcha,
  wrap(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ message: "В логине нельзя использовать спецсимволы (только латиница, цифры и _)" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: "Некорректный email" });
    if (password.length < 6)
      return res.status(400).json({ message: "Пароль должен быть не короче 6 символов" });

    const exists = await getOne("SELECT id FROM users WHERE username = ? OR email = ?", [username, email]);
    if (exists) return res.status(409).json({ message: "Пользователь с таким логином или email уже существует" });

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    await run("INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)", [
      username,
      email,
      hash,
      salt,
    ]);
    res.json({ message: "Аккаунт создан, теперь войдите" });
  })
);

app.post(
  "/auth/forgot-password",
  requireCaptcha,
  wrap(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await getOne("SELECT id FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ message: "Пользователь с таким email не найден" });
    res.json({ message: "Ссылка для сброса отправлена на email" });
  })
);

app.post(
  "/auth/reset-password",
  wrap(async (req, res) => {
    res.status(400).json({ message: "Токен подтверждения не найден в ссылке" });
  })
);

app.post(
  "/auth/change-password",
  requireCaptcha,
  authUser,
  wrap(async (req, res) => {
    const password = String(req.body.password || "");
    if (password.length < 8)
      return res.status(400).json({ message: "Пароль должен быть минимум 8 символов" });
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    await run("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, req.user.id]);
    res.json({ message: "Пароль успешно изменён" });
  })
);

async function activateKeyForUser(req, res, key) {
  const k = await getOne("SELECT * FROM keys WHERE key = ?", [key]);
  if (!k) return res.status(404).json({ message: "Ключ недействителен" });
  if (k.used) return res.status(409).json({ message: "Ключ уже использован" });

  const hwid = deviceHwid(req);
  const days = Number(k.days) > 0 ? Number(k.days) : 365;

  const now = new Date();
  const cur = req.user.sub_end ? new Date(req.user.sub_end) : null;
  let base = cur && cur.getTime() > now.getTime() ? cur : now;
  let subEnd = new Date(base.getTime() + days * 86400000);
  if (days >= 36500) subEnd = new Date("2099-12-31T23:59:59.000Z");

  const statements = [
    {
      sql: "UPDATE keys SET used = 1, used_by = ?, activated_at = datetime('now') WHERE key = ?",
      args: [req.user.id, key],
    },
    { sql: "UPDATE users SET sub_end = ? WHERE id = ?", args: [subEnd.toISOString(), req.user.id] },
  ];
  if (hwid)
    statements.push({ sql: "UPDATE users SET hwid = ? WHERE id = ?", args: [hwid, req.user.id] });

  await withRetry(() => client.batch(statements, "write"));
  res.json({ message: "Ключ активирован, подписка продлена" });
}

app.post("/auth/keyActivate", authUser, wrap(async (req, res) => {
  const key = String(req.query.key || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Введите ключ активации" });
  await activateKeyForUser(req, res, key);
}));

app.post("/auth/keyActivateHwid", authUser, wrap(async (req, res) => {
  const key = String(req.query.key || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Введите ключ активации" });
  await activateKeyForUser(req, res, key);
}));

app.post("/auth/keyHwidActivate", authUser, wrap(async (req, res) => {
  const key = String(req.query.key || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Введите ключ активации" });
  await activateKeyForUser(req, res, key);
}));

app.post("/auth/hwidKeyActivate", authUser, wrap(async (req, res) => {
  const key = String(req.query.key || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Введите ключ активации" });
  await activateKeyForUser(req, res, key);
}));

/* user */

app.get("/user/profile", authUser, wrap(async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role || "USER",
    regDate: u.created_at,
    hwid: u.hwid || "",
    subscription: u.subscription || "none",
  });
}));

app.get("/user/getHwid", authUser, wrap(async (req, res) => {
  res.json({ hwid: req.user.hwid || "" });
}));

app.post("/user/sub", authUser, wrap(async (req, res) => {
  const end = req.user.sub_end ? new Date(req.user.sub_end) : null;
  if (end && end.getTime() > Date.now()) {
    res.json({ sub: { outDate: end.toISOString() } });
  } else {
    res.json({ sub: null });
  }
}));

app.get("/user/discount", authUser, wrap(async (req, res) => {
  res.json({ success: 0 });
}));

app.post("/user/eventGetter", authUser, wrap(async (req, res) => {
  res.json({ success: true, events: [] });
}));

/* settings */

app.post("/settings/ram", authUser, wrap(async (req, res) => {
  res.json({ success: true });
}));

/* payment -> funpay offer */

app.get("/payment/createPlatega", authUser, wrap(async (req, res) => {
  res.json({ success: true, payment_url: FUPAY_OFFER });
}));

/* media */

app.post("/media/getPromoInfoForMedia", authUser, wrap(async (req, res) => {
  res.status(404).json({ message: "Медиа-панель недоступна" });
}));

/* zaliv (client upload) — not available */

app.post("/zaliv/jar", authUser, wrap(async (req, res) => {
  res.status(400).json({ message: "Заливка клиента недоступна" });
}));

app.post("/zaliv/jar/confirm", wrap(async (req, res) => {
  res.status(400).json({ message: "Заливка клиента недоступна" });
}));

/* admin (minimal) */

function isAdminUser(u) {
  const role = String((u && u.role) || "").toUpperCase();
  return role === "ADMIN" || role === "OWNER" || role === "MODER";
}

async function authAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Нет токена авторизации" });
    const s = await getOne("SELECT * FROM sessions WHERE token = ?", [token]);
    if (!s) return res.status(401).json({ message: "Нет токена авторизации" });
    const user = await getOne("SELECT * FROM users WHERE id = ?", [s.user_id]);
    if (!user || !isAdminUser(user)) return res.status(403).json({ message: "Нет доступа" });
    req.user = user;
    next();
  } catch (e) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
}

app.post("/admin/give/check-admin-panel", authAdmin, wrap(async (req, res) => {
  res.json({ success: true });
}));

app.post("/admin/give/user", authAdmin, wrap(async (req, res) => {
  const users = await getAll("SELECT id, username, email, role, hwid, sub_end, created_at FROM users ORDER BY id");
  const list = users.map((u) => {
    const end = u.sub_end ? new Date(u.sub_end) : null;
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      role: (u.role || "USER").toUpperCase(),
      regDate: u.created_at,
      hasSubscription: !!(end && end.getTime() > Date.now()),
    };
  });
  res.json(list);
}));

app.post("/admin/give/keys", authAdmin, wrap(async (req, res) => {
  const keys = await getAll(
    "SELECT k.key, k.used, k.activated_at, k.days, u.username AS used_by FROM keys k LEFT JOIN users u ON u.id = k.used_by ORDER BY k.used, k.key"
  );
  const list = keys.map((k, i) => ({
    id: i + 1,
    value: k.key,
    days: Number(k.days) || 365,
    used: Number(k.used) || 0,
    entDate: k.activated_at || "",
    role: undefined,
  }));
  res.json(list);
}));

app.post("/admin/give/hwidKeysGet", authAdmin, wrap(async (req, res) => {
  res.json([]);
}));

app.post("/admin/give/promocode", authAdmin, wrap(async (req, res) => {
  res.json([]);
}));

app.post(
  "/admin/create/keys",
  authAdmin,
  wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 365, 1), 36500);
    const quantity = Math.min(Math.max(parseInt(req.query.quantity, 10) || 1, 1), 100);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const generated = [];
    for (let i = 0; i < quantity; i++) {
      let key = "VGNC-";
      for (let g = 0; g < 4; g++) {
        let part = "";
        for (let j = 0; j < 4; j++) part += alphabet[crypto.randomInt(alphabet.length)];
        key += part + (g < 3 ? "-" : "");
      }
      try {
        await run("INSERT INTO keys (key, days) VALUES (?, ?)", [key, days]);
        generated.push(key);
      } catch (e) {}
    }
    res.json({ success: true, Success: generated, message: "Ключи сгенерированы" });
  })
);

app.put("/admin/read/user", authAdmin, wrap(async (req, res) => {
  res.status(403).json({ message: "Действие недоступно" });
}));

app.post("/admin/read/deleteGrant", authAdmin, wrap(async (req, res) => {
  res.status(403).json({ message: "Действие недоступно" });
}));

app.get("/admin/payment/balances", authAdmin, wrap(async (req, res) => {
  res.status(403).json({ message: "Действие недоступно" });
}));

app.post("/admin/payment/transactions", authAdmin, wrap(async (req, res) => {
  res.status(403).json({ message: "Действие недоступно" });
}));

app.get("/admin/logs", authAdmin, wrap(async (req, res) => {
  res.status(403).json({ message: "Действие недоступно" });
}));

/* fallback */

app.use((req, res) => {
  res.status(404).json({ message: "Не найдено" });
});

module.exports = app;
module.exports.ensureDb = ensureDb;