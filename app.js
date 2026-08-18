const path = require("path");
const crypto = require("crypto");
const net = require("net");
const tls = require("tls");
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
CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promo TEXT NOT NULL,
  media_uid TEXT,
  percent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS banned_hwids (
  hwid TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
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

/* ================= smtp ================= */

function smtpConnect(host, port, secure) {
  return new Promise((resolve, reject) => {
    const sock = secure ? tls.connect({ host, port }) : net.connect({ host, port });
    let buf = "";
    const waiters = [];
    sock.setEncoding("utf8");
    sock.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const raw = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        const w = waiters.shift();
        if (w) w(raw);
      }
    });
    sock.on("error", (e) => reject(e));
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("SMTP timeout"));
    }, 15000);
    waiters.push((raw) => {
      if (!/^220/.test(raw)) {
        clearTimeout(timer);
        sock.destroy();
        reject(new Error("SMTP greeting: " + raw));
        return;
      }
      clearTimeout(timer);
      resolve({
        sock,
        cmd(line) {
          return new Promise((res, rej) => {
            waiters.push((r) => (/^\d{3} /.test(r) ? res(r) : rej(new Error("SMTP: " + r))));
            sock.write(line + "\r\n");
          });
        },
      });
    });
  });
}

async function sendResetEmail(to, link) {
  const host = process.env.SMTP_HOST;
  if (!host) return false;
  try {
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM || user;
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const secure = port === 465;
    const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
    const subject =
      "=?UTF-8?B?" + Buffer.from("Восстановление пароля Sunless", "utf8").toString("base64") + "?=";

    const s = await smtpConnect(host, port, secure);
    await s.cmd("EHLO " + host);
    if (user) {
      await s.cmd("AUTH LOGIN");
      await s.cmd(b64(user));
      await s.cmd(b64(pass));
    }
    await s.cmd("MAIL FROM:<" + from + ">");
    await s.cmd("RCPT TO:<" + to + ">");
    await s.cmd("DATA");
    await s.cmd(
      "Subject: " + subject + "\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        "MIME-Version: 1.0\r\n\r\n" +
        "Здравствуйте! Для восстановления пароля перейдите по ссылке:\r\n" + link + "\r\n\r\n" +
        "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\r\n."
    );
    try {
      await s.cmd("QUIT");
    } catch (e) {}
    s.sock.destroy();
    return true;
  } catch (e) {
    console.error("SMTP error:", e.message);
    return false;
  }
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

function optionalCaptcha(req, res, next) {
  const token = String(req.headers["cf-turnstile-token"] || req.headers["altcha-token"] || "").trim();
  if (token && !altchaVerify(token)) {
    return res.status(400).json({ message: "Пройдите проверку капчи" });
  }
  next();
}

const rateMap = new Map();
function getRateKey(name, req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  return name + ":" + ip;
}
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = getRateKey(name, req);
    const now = Date.now();
    let rec = rateMap.get(key);
    if (!rec || now - rec.t >= windowMs) {
      rec = { t: now, n: 0 };
      rateMap.set(key, rec);
    }
    rec.n += 1;
    if (rec.n > max) {
      const left = Math.ceil((windowMs - (now - rec.t)) / 1000);
      return res.status(429).json({ message: "Слишком много попыток. Подождите " + left + " сек" });
    }
    next();
  };
}
function clearRate(name, req) {
  rateMap.delete(getRateKey(name, req));
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
    if (user.hwid) {
      const banned = await getOne("SELECT * FROM banned_hwids WHERE hwid = ?", [user.hwid]);
      if (banned) return res.status(403).json({ message: "Аккаунт заблокирован. Обратитесь в поддержку" });
    }
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
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, CF-Turnstile-Token, Altcha-Token, x-hwid");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  if (req.url.startsWith("/api/") && !req.url.startsWith("/api/altcha/")) {
    req.url = req.url.slice(4);
  }
  next();
});
app.use(express.static(ROOT, { extensions: ["html"] }));

/* altcha */

app.get("/api/altcha/challenge", wrap(async (req, res) => {
  res.json(altchaChallenge());
}));

/* auth (skycore-compatible contract) */

app.post(
  "/auth/login",
  optionalCaptcha,
  rateLimit("login", 10, 5 * 60 * 1000),
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
    if (user.hwid) {
      const banned = await getOne("SELECT * FROM banned_hwids WHERE hwid = ?", [user.hwid]);
      if (banned) return res.status(403).json({ message: "Аккаунт заблокирован. Обратитесь в поддержку" });
    }
    clearRate("login", req);

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
  optionalCaptcha,
  rateLimit("forgot", 5, 10 * 60 * 1000),
  wrap(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await getOne("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(404).json({ message: "Пользователь с таким email не найден" });

    const token = makeToken();
    const expires = new Date(Date.now() + 3600000).toISOString();
    await run("DELETE FROM reset_tokens WHERE user_id = ?", [user.id]);
    await run("INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", [
      token,
      user.id,
      expires,
    ]);

    const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
    const origin = process.env.SITE_URL || "https://" + host;
    const link = origin + "/reset-password?token=" + token;

    const sent = await sendResetEmail(user.email, link);
    if (sent) return res.json({ message: "Ссылка для сброса отправлена на email" });

    console.log("RESET LINK (SMTP not configured):", link);
    res.json({ message: "Ссылка для сброса: " + link });
  })
);

app.post(
  "/auth/reset-password",
  wrap(async (req, res) => {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    if (!token) return res.status(400).json({ message: "Токен подтверждения не найден в ссылке" });

    const rt = await getOne("SELECT * FROM reset_tokens WHERE token = ?", [token]);
    if (!rt) return res.status(400).json({ message: "Токен подтверждения не найден в ссылке" });
    if (new Date(rt.expires_at).getTime() < Date.now())
      return res.status(400).json({ message: "Ссылка для сброса устарела. Запросите новую" });
    if (password.length < 8)
      return res.status(400).json({ message: "Пароль должен быть минимум 8 символов" });

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);
    await run("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, rt.user_id]);
    await run("DELETE FROM reset_tokens WHERE token = ?", [token]);
    await run("DELETE FROM sessions WHERE user_id = ?", [rt.user_id]);
    res.json({ message: "Пароль успешно изменён" });
  })
);

app.post(
  "/auth/change-password",
  optionalCaptcha,
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
  let k = await getOne("SELECT * FROM keys WHERE key = ?", [key]);
  let table = "keys";
  if (!k) {
    k = await getOne("SELECT * FROM hwid_keys WHERE key = ?", [key]);
    table = "hwid_keys";
  }
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
      sql: `UPDATE ${table} SET used = 1, used_by = ?, activated_at = datetime('now') WHERE key = ?`,
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
  const end = u.sub_end ? new Date(u.sub_end) : null;
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role || "USER",
    regDate: u.created_at,
    hwid: u.hwid || "",
    subscription: end && end.getTime() > Date.now() ? end.toISOString() : "none",
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
  if (role === "ADMIN" || role === "OWNER" || role === "MODER") return true;
  const admins = String(process.env.ADMIN_USERS || "coderdlc")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(String((u && u.username) || "").toLowerCase());
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
  const list = keys.map((k) => ({
    id: k.key,
    value: k.key,
    days: Number(k.days) || 365,
    used: Number(k.used) || 0,
    entDate: k.activated_at || "",
    usedBy: k.used_by || "",
    role: undefined,
  }));
  res.json(list);
}));

app.post("/admin/read/deleteKeys", authAdmin, wrap(async (req, res) => {
  const key = String(req.query.id || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Укажите ключ" });
  await run("DELETE FROM keys WHERE key = ?", [key]);
  res.json({ success: true, message: "Ключ удалён" });
}));

app.post("/admin/create/keysHwid", authAdmin, wrap(async (req, res) => {
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
      await run("INSERT INTO hwid_keys (key) VALUES (?)", [key]);
      generated.push(key);
    } catch (e) {}
  }
  res.json({ success: true, Success: generated, message: "Ключи сгенерированы" });
}));

app.post("/admin/keysHwid", authAdmin, wrap(async (req, res) => {
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
      await run("INSERT INTO hwid_keys (key) VALUES (?)", [key]);
      generated.push(key);
    } catch (e) {}
  }
  res.json({ success: true, Success: generated, message: "Ключи сгенерированы" });
}));

app.post("/admin/give/hwidKeysGet", authAdmin, wrap(async (req, res) => {
  const keys = await getAll(
    "SELECT k.key, k.used, k.activated_at, k.days, u.username AS used_by FROM hwid_keys k LEFT JOIN users u ON u.id = k.used_by ORDER BY k.used, k.key"
  );
  res.json(
    keys.map((k) => ({
      id: k.key,
      value: k.key,
      days: Number(k.days) || 365,
      used: Number(k.used) || 0,
      entDate: k.activated_at || "",
      usedBy: k.used_by || "",
      role: undefined,
    }))
  );
}));

app.post("/admin/read/deleteHwidKeys", authAdmin, wrap(async (req, res) => {
  const key = String(req.query.id || "").trim().toUpperCase();
  if (!key) return res.status(400).json({ message: "Укажите ключ" });
  await run("DELETE FROM hwid_keys WHERE key = ?", [key]);
  res.json({ success: true, message: "Ключ удалён" });
}));

app.post("/admin/give/promocode", authAdmin, wrap(async (req, res) => {
  const list = await getAll("SELECT * FROM promos ORDER BY id");
  res.json(
    list.map((p) => ({
      id: p.id,
      value: p.value,
      discount: Number(p.discount) || 0,
      outActive: Number(p.outActive) || 0,
      entActive: Number(p.entActive) || 0,
      outDate: p.outDate || "",
      days: Number(p.days) || 0,
    }))
  );
}));

app.post("/admin/create/promo", authAdmin, wrap(async (req, res) => {
  const value = String(req.query.value || "").trim().toUpperCase();
  const discount = Number(req.query.discount);
  const outActive = Number(req.query.outActived ?? req.query.outActive);
  const days = Number(req.query.days);
  if (!/^[A-Z0-9]{3,32}$/.test(value))
    return res.status(400).json({ message: "Промокод: только латиница и цифры, 3-32 символа" });
  if (!Number.isFinite(discount) || discount < 0 || discount > 100)
    return res.status(400).json({ message: "Скидка должна быть от 0 до 100" });
  if (!Number.isFinite(outActive) || outActive < 1)
    return res.status(400).json({ message: "Лимит активаций должен быть не меньше 1" });
  const d = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 36500) : 0;
  try {
    await run("INSERT INTO promos (value, discount, outActive, outDate, days) VALUES (?, ?, ?, ?, ?)", [
      value,
      Math.floor(discount),
      Math.floor(outActive),
      d > 0 ? new Date(Date.now() + d * 86400000).toISOString() : "",
      d,
    ]);
  } catch (e) {
    return res.status(409).json({ message: "Промокод уже существует" });
  }
  res.json({ success: true, message: "Промокод создан" });
}));

app.post("/admin/read/deletePromocode", authAdmin, wrap(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) return res.status(400).json({ message: "Укажите id промокода" });
  await run("DELETE FROM promos WHERE id = ?", [id]);
  res.json({ success: true, message: "Промокод удалён" });
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
  const username = String(req.query.username || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!username || !email) return res.status(400).json({ message: "Заполни username и email." });
  const user = await getOne("SELECT * FROM users WHERE username = ? AND email = ?", [username, email]);
  if (!user) return res.status(404).json({ message: "Пользователь не найден" });

  const updates = [];
  const args = [];
  let newPassword = null;

  const role = String(req.query.role || "").trim().toUpperCase();
  if (role && ["USER", "ADMIN", "OWNER", "MODER", "MEDIA", "BETA"].includes(role)) {
    updates.push("role = ?");
    args.push(role);
  }

  const subs = Number(req.query.subs);
  if (Number.isFinite(subs) && subs > 0) {
    const days = Math.min(subs, 36500);
    const now = new Date();
    const cur = user.sub_end ? new Date(user.sub_end) : null;
    const base = cur && cur.getTime() > now.getTime() ? cur : now;
    let end = new Date(base.getTime() + days * 86400000);
    if (days >= 36500) end = new Date("2099-12-31T23:59:59.000Z");
    updates.push("sub_end = ?");
    args.push(end.toISOString());
  }

  if (req.query.passwordReset === "true") {
    newPassword = crypto.randomBytes(8).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    const salt = crypto.randomBytes(16).toString("hex");
    updates.push("password_hash = ?", "salt = ?");
    args.push(hashPassword(newPassword, salt), salt);
  }

  if (req.query.hwidReset === "true") {
    updates.push("hwid = ''");
  }

  if (updates.length) {
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [...args, user.id]);
  }

  if (newPassword) return res.json({ message: "New password: " + newPassword });
  res.json({ message: "Пользователь обновлён" });
}));

app.post("/admin/give/userProfile", authAdmin, wrap(async (req, res) => {
  const id = Number(req.query.id || 0);
  const user = await getOne("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ message: "Пользователь не найден" });
  const end = user.sub_end ? new Date(user.sub_end) : null;
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: (user.role || "USER").toUpperCase(),
    hasSubscription: !!(end && end.getTime() > Date.now()),
  });
}));

app.post("/admin/read/deleteGrant", authAdmin, wrap(async (req, res) => {
  const promo = String(req.query.promo || "").trim().toUpperCase();
  if (!promo) return res.status(400).json({ message: "Укажите промокод" });
  await run("DELETE FROM grants WHERE promo = ?", [promo]);
  res.json({ success: true, message: "Грант удалён" });
}));

app.post("/admin/create/grantAccessPromo", authAdmin, wrap(async (req, res) => {
  const promo = String(req.query.promo || "").trim().toUpperCase();
  const mediaUid = String(req.query.mediaUid || "").trim();
  const percent = Number(req.query.percent);
  if (!promo || !mediaUid)
    return res.status(400).json({ message: "Укажите промокод и mediaUid" });
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    return res.status(400).json({ message: "Процент должен быть от 0 до 100" });
  await run("INSERT INTO grants (promo, media_uid, percent) VALUES (?, ?, ?)", [
    promo,
    mediaUid,
    Math.floor(percent),
  ]);
  res.json({ success: true, message: "Доступ выдан" });
}));

app.post("/admin/read/resetBalancePromo", authAdmin, wrap(async (req, res) => {
  const promo = String(req.query.promo || "").trim().toUpperCase();
  if (!promo) return res.status(400).json({ message: "Укажите промокод" });
  await run("UPDATE promos SET entActive = 0 WHERE value = ?", [promo]);
  res.json({ success: true, message: "Баланс промокода сброшен" });
}));

app.post("/admin/read/deleteSub", authAdmin, wrap(async (req, res) => {
  const username = String(req.query.username || "").trim();
  if (!username) return res.status(400).json({ message: "Укажите username" });
  await run("UPDATE users SET sub_end = NULL WHERE username = ?", [username]);
  res.json({ success: true, message: "Подписка снята" });
}));

app.post("/admin/create/bannedHwidForId", authAdmin, wrap(async (req, res) => {
  const id = Number(req.query.id || 0);
  const user = await getOne("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ message: "Пользователь не найден" });
  if (!user.hwid) return res.status(400).json({ message: "У пользователя нет HWID" });
  await run("INSERT OR REPLACE INTO banned_hwids (hwid, user_id) VALUES (?, ?)", [user.hwid, user.id]);
  res.json({ success: true, message: "HWID заблокирован" });
}));

app.post("/admin/bannedHwidForId", authAdmin, wrap(async (req, res) => {
  const id = Number(req.query.id || 0);
  const user = await getOne("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ message: "Пользователь не найден" });
  if (!user.hwid) return res.status(400).json({ message: "У пользователя нет HWID" });
  await run("INSERT OR REPLACE INTO banned_hwids (hwid, user_id) VALUES (?, ?)", [user.hwid, user.id]);
  res.json({ success: true, message: "HWID заблокирован" });
}));

app.post("/admin/read/unbanHwid", authAdmin, wrap(async (req, res) => {
  const id = Number(req.query.id || 0);
  const user = await getOne("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ message: "Пользователь не найден" });
  if (user.hwid) await run("DELETE FROM banned_hwids WHERE hwid = ?", [user.hwid]);
  res.json({ success: true, message: "HWID разблокирован" });
}));

app.get("/admin/payment/balances", authAdmin, wrap(async (req, res) => {
  res.json({ success: true, balances: [] });
}));

app.post("/admin/payment/transactions", authAdmin, wrap(async (req, res) => {
  res.json({ success: true, transactions: [] });
}));

app.get("/admin/logs", authAdmin, wrap(async (req, res) => {
  res.json([]);
}));

/* fallback */

app.use((req, res) => {
  res.status(404).json({ message: "Не найдено" });
});

module.exports = app;
module.exports.ensureDb = ensureDb;