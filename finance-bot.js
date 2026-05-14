import fs from "fs";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Telegraf, Markup } from "telegraf";
import admin from "firebase-admin";

dotenv.config();

/* ================= BOTHOST FIREBASE BOOTSTRAP ================= */

function ensureFirebaseAdminFile() {
  const filePath = "./firebase-admin.json";
  const b64 = process.env.FIREBASE_ADMIN_BASE64;

  console.log("BOOTSTRAP_FIREBASE_START");

  if (fs.existsSync(filePath)) {
    console.log("firebase-admin.json already exists");
    return;
  }

  if (!b64) {
    console.log("FIREBASE_ADMIN_BASE64 is not set");
    return;
  }

  try {
    const jsonText = Buffer.from(b64, "base64").toString("utf8");
    JSON.parse(jsonText);
    fs.writeFileSync(filePath, jsonText, "utf8");
    console.log("firebase-admin.json created from FIREBASE_ADMIN_BASE64");
  } catch (error) {
    console.error("FIREBASE_ADMIN_BASE64 decode/write error");
    console.error(error);
  }
}

ensureFirebaseAdminFile();

/* ================= ENV ================= */

if (!process.env.BOT_TOKEN) {
  console.error("BOT_TOKEN NOT FOUND");
  process.exit(1);
}

if (!process.env.WEBAPP_URL) {
  console.error("WEBAPP_URL NOT FOUND");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const WEBAPP_URL = String(process.env.WEBAPP_URL || "").replace(/\/$/, "");
const SITE_ORIGIN = String(process.env.SITE_ORIGIN || WEBAPP_URL).replace(/\/$/, "");
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = String(process.env.BOT_USERNAME || "my_rashodi_bot").replace(/^@/, "");

const ALLOWED_ORIGINS = [
  WEBAPP_URL,
  SITE_ORIGIN,
  "https://fincenter-pro.web.app",
  "https://fincenter-pro.firebaseapp.com",
  "https://finance-bot-production-0814.up.railway.app"
].filter(Boolean);

/* ================= FIREBASE ================= */

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("USING FIREBASE_SERVICE_ACCOUNT ENV");

  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    console.error("FIREBASE_SERVICE_ACCOUNT JSON PARSE ERROR");
    console.error(error);
    process.exit(1);
  }
} else if (process.env.FIREBASE_ADMIN_BASE64) {
  console.log("USING FIREBASE_ADMIN_BASE64 ENV");

  try {
    serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_ADMIN_BASE64, "base64").toString("utf8")
    );
  } catch (error) {
    console.error("FIREBASE_ADMIN_BASE64 JSON PARSE ERROR");
    console.error(error);
    process.exit(1);
  }
} else {
  console.log("USING LOCAL FIREBASE FILE");

  if (!fs.existsSync("./firebase-admin.json")) {
    console.error("firebase-admin.json NOT FOUND");
    process.exit(1);
  }

  serviceAccount = JSON.parse(fs.readFileSync("./firebase-admin.json", "utf8"));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/* ================= EXPRESS ================= */

const app = express();

app.set("trust proxy", true);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const cleanOrigin = String(origin).replace(/\/$/, "");

    if (ALLOWED_ORIGINS.includes(cleanOrigin)) {
      return callback(null, true);
    }

    console.warn("CORS origin not in allowlist, allowed anyway:", cleanOrigin);
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static("public"));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} origin=${req.headers.origin || "-"}`);
  next();
});

/* ================= TELEGRAM ================= */

const bot = new Telegraf(BOT_TOKEN);

/* ================= TABLE MAP ================= */

const TABLE_COLUMNS = [
  "CATEGORY",
  "INCOME",
  "Квартира",
  "Доставка",
  "Продукты",
  "Здоровье",
  "Налоги",
  "Кальянка",
  "Клининг",
  "Тренировки",
  "самокат",
  "Такси",
  "Офис",
  "Ресторан",
  "Свидание",
  "Развлечения",
  "Туры",
  "Покупки",
  "Подарки",
  "Путешествия",
  "Подушка",
  "Брокер",
  "Крипта",
  "Бизнес",
  "Красота",
  "Обучение"
];

const CATEGORY_ALIASES = {
  "Продукты": ["продукты", "еда", "ужин", "обед", "магазин"],
  "Доставка": ["доставка", "wolt", "glovo"],
  "Квартира": ["квартира", "аренда"],
  "Такси": ["такси", "uber"],
  "Ресторан": ["ресторан", "кафе", "кофе"],
  "Развлечения": ["развлечения", "кино", "игры"],
  "Покупки": ["покупки", "одежда", "wildberries", "ozon"],
  "Здоровье": ["здоровье", "аптека"],
  "Тренировки": ["спорт", "зал", "gym"],
  "Крипта": ["крипта", "btc", "bitcoin"],
  "Бизнес": ["бизнес"],
  "Красота": ["красота", "барбер"],
  "Обучение": ["обучение", "курс"]
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim();
}

function detectSheetCategory(type, text) {
  if (type === "income") return "INCOME";

  const lower = normalizeText(text);

  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(normalizeText(alias))) return category;
    }
  }

  return "Развлечения";
}

function getColumnIndexByCategory(category) {
  const index = TABLE_COLUMNS.findIndex((name) => name === category);
  return index === -1 ? -1 : index + 1;
}

function addValueToSheet(state, category, amount) {
  if (!state.sheet) state.sheet = {};

  const colIndex = getColumnIndexByCategory(category);
  if (colIndex === -1) return null;

  for (let row = 5; row <= 32; row++) {
    const key = `${row}:${colIndex}`;
    if (!state.sheet[key]) {
      state.sheet[key] = amount;
      return key;
    }
  }

  return null;
}

/* ================= DEFAULT STATE ================= */

function defaultState() {
  return {
    theme: "dark",
    currency: "₸",
    operationType: "expense",
    operations: [],
    sheet: {},
    history: [],
    budgets: [],
    goals: [],
    subscriptions: [],
    debts: [],
    investments: [],
    customColumns: [],
    tableSettings: {
      fitMode: "fit",
      height: "normal",
      autosave: "on"
    },
    telegramConnected: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeState(state) {
  const base = defaultState();
  const incoming = state && typeof state === "object" ? state : {};

  const merged = {
    ...base,
    ...incoming,
    tableSettings: {
      ...base.tableSettings,
      ...(incoming.tableSettings || {})
    }
  };

  merged.operations = Array.isArray(merged.operations) ? merged.operations : [];
  merged.history = Array.isArray(merged.history) ? merged.history : [];
  merged.budgets = Array.isArray(merged.budgets) ? merged.budgets : [];
  merged.goals = Array.isArray(merged.goals) ? merged.goals : [];
  merged.subscriptions = Array.isArray(merged.subscriptions) ? merged.subscriptions : [];
  merged.debts = Array.isArray(merged.debts) ? merged.debts : [];
  merged.investments = Array.isArray(merged.investments) ? merged.investments : [];
  merged.customColumns = Array.isArray(merged.customColumns) ? merged.customColumns : [];
  merged.sheet = merged.sheet && typeof merged.sheet === "object" ? merged.sheet : {};

  return merged;
}

/* ================= TELEGRAM AUTH HELPERS ================= */

function telegramUid(telegramId) {
  return `telegram:${String(telegramId)}`;
}

function normalizeUserDocId(userId) {
  const raw = String(userId || "").trim();

  if (!raw) return raw;
  if (raw.startsWith("telegram:")) return raw;
  if (raw.startsWith("tg_")) return telegramUid(raw.replace(/^tg_/, ""));
  if (/^\d+$/.test(raw)) return telegramUid(raw);

  return raw;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isFreshTelegramAuth(authDate) {
  const ts = Number(authDate || 0);
  if (!ts) return false;

  const ageMs = Date.now() - ts * 1000;
  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
}

function safeHashCompare(hexA, hexB) {
  if (!/^[a-f0-9]{64}$/i.test(String(hexA || ""))) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(hexB || ""))) return false;

  return crypto.timingSafeEqual(
    Buffer.from(String(hexA), "hex"),
    Buffer.from(String(hexB), "hex")
  );
}

function verifyTelegramLoginWidget(data) {
  if (!data || typeof data !== "object") return false;

  const { hash, ...payload } = data;

  if (!hash || !payload.id || !payload.auth_date) return false;
  if (!isFreshTelegramAuth(payload.auth_date)) return false;

  const checkString = Object.keys(payload)
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== "")
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  return safeHashCompare(calculatedHash, hash);
}

function verifyTelegramWebAppInitData(initData) {
  if (!initData || typeof initData !== "string") return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) return null;

  params.delete("hash");

  const authDate = params.get("auth_date");
  if (!isFreshTelegramAuth(authDate)) return null;

  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (!safeHashCompare(calculatedHash, hash)) return null;

  const user = safeJsonParse(params.get("user") || "{}");
  if (!user || !user.id) return null;

  return user;
}

async function ensureTelegramUserProfile(tgUser) {
  const uid = telegramUid(tgUser.id);
  const displayName =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
    tgUser.username ||
    "Telegram User";

  await db.collection("users").doc(uid).set(
    {
      uid,
      telegramConnected: true,
      telegramId: String(tgUser.id),
      telegram: {
        id: String(tgUser.id),
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        username: tgUser.username || "",
        displayName,
        photoUrl: tgUser.photo_url || ""
      },
      authProvider: "telegram",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return uid;
}

/* ================= DATABASE ================= */

async function getUserState(userId) {
  const uid = normalizeUserDocId(userId);
  if (!uid) return defaultState();

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const state = defaultState();

    await ref.set({
      uid,
      state,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return state;
  }

  const cloud = snap.data() || {};
  const rawState = cloud.state || cloud;
  const state = normalizeState(rawState);

  if (cloud.telegramConnected || cloud.telegramId || cloud.telegram) {
    state.telegramConnected = true;
  }

  return state;
}

async function saveUserState(userId, state) {
  const uid = normalizeUserDocId(userId);
  if (!uid) throw new Error("NO_USER_ID");

  const normalized = normalizeState(state);
  normalized.updatedAt = new Date().toISOString();

  await db.collection("users").doc(uid).set(
    {
      uid,
      state: normalized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return normalized;
}

/* ================= API ================= */

function healthPayload() {
  return {
    ok: true,
    service: "FinCenter",
    bot: BOT_USERNAME,
    webappUrl: WEBAPP_URL,
    siteOrigin: SITE_ORIGIN,
    allowedOrigins: ALLOWED_ORIGINS,
    time: new Date().toISOString()
  };
}

app.get("/", (req, res) => res.json(healthPayload()));
app.get("/health", (req, res) => res.json(healthPayload()));
app.get("/api/health", (req, res) => res.json(healthPayload()));

app.post("/api/auth/telegram", async (req, res) => {
  try {
    let tgUser = null;

    if (req.body?.initData) {
      tgUser = verifyTelegramWebAppInitData(req.body.initData);
    } else if (verifyTelegramLoginWidget(req.body)) {
      tgUser = req.body;
    }

    if (!tgUser || !tgUser.id) {
      return res.status(401).json({
        ok: false,
        error: "BAD_TELEGRAM_AUTH",
        message: "Telegram auth data is invalid or expired"
      });
    }

    const uid = await ensureTelegramUserProfile(tgUser);
    const currentState = await getUserState(uid);
    currentState.telegramConnected = true;
    await saveUserState(uid, currentState);

    const token = await admin.auth().createCustomToken(uid, {
      provider: "telegram",
      telegramId: String(tgUser.id)
    });

    const displayName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
      tgUser.username ||
      "Telegram User";

    return res.json({
      ok: true,
      token,
      uid,
      user: {
        uid,
        telegramId: String(tgUser.id),
        displayName,
        username: tgUser.username || "",
        photoURL: tgUser.photo_url || "",
        provider: "telegram"
      }
    });
  } catch (e) {
    console.error("TELEGRAM AUTH ERROR", e);

    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: e.message || "Unknown server error"
    });
  }
});

app.get("/api/state", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "NO_USER_ID" });
    }

    const state = await getUserState(userId);
    return res.json({ ok: true, state });
  } catch (e) {
    console.error("GET STATE ERROR", e);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: e.message || "Unknown server error"
    });
  }
});

app.post("/api/state", async (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "NO_USER_ID" });
    }

    const incomingState =
      req.body && typeof req.body === "object" && req.body.state
        ? req.body.state
        : req.body;

    const state = await saveUserState(userId, incomingState);
    return res.json({ ok: true, state });
  } catch (e) {
    console.error("SAVE STATE ERROR", e);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: e.message || "Unknown server error"
    });
  }
});

app.post("/api/reset", async (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "NO_USER_ID" });
    }

    await saveUserState(userId, defaultState());
    return res.json({ ok: true });
  } catch (e) {
    console.error("RESET ERROR", e);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: e.message || "Unknown server error"
    });
  }
});

/* ================= BOT UI ================= */

function mainKeyboard(tgId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        "🌐 Открыть FinCenter",
        `${WEBAPP_URL}?telegram_connected=1&tg_id=${tgId}`
      )
    ],
    [
      Markup.button.callback("➕ Расход", "add_expense"),
      Markup.button.callback("💸 Доход", "add_income")
    ],
    [Markup.button.callback("📊 Статистика", "stats")]
  ]);
}

async function getStatsText(tgId) {
  const state = await getUserState(tgId);
  const operations = state.operations || [];

  const income = operations
    .filter((x) => x.type === "income")
    .reduce((a, b) => a + Math.abs(Number(b.amount || 0)), 0);

  const expense = operations
    .filter((x) => x.type !== "income")
    .reduce((a, b) => a + Math.abs(Number(b.amount || 0)), 0);

  const balance = income - expense;

  return `
🏦 FinCenter

💰 Баланс: ${balance.toLocaleString("ru-RU")} ₸
📈 Доходы: ${income.toLocaleString("ru-RU")} ₸
📉 Расходы: ${expense.toLocaleString("ru-RU")} ₸
📦 Операций: ${operations.length}
`;
}

/* ================= BOT ================= */

bot.start(async (ctx) => {
  try {
    const tgId = ctx.from.id;
    await getUserState(tgId);
    const text = await getStatsText(tgId);
    return ctx.reply(text, mainKeyboard(tgId));
  } catch (e) {
    console.error("BOT START ERROR", e);
    return ctx.reply("Ошибка запуска бота. Проверь логи сервера.");
  }
});

bot.action("stats", async (ctx) => {
  try {
    const tgId = ctx.from.id;
    const text = await getStatsText(tgId);
    await ctx.answerCbQuery();
    return ctx.editMessageText(text, mainKeyboard(tgId));
  } catch (e) {
    console.error("BOT STATS ERROR", e);
  }
});

bot.action("add_expense", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(`🔻 Отправь расход:\n\n-2500 Продукты\n-5000 Такси`);
});

bot.action("add_income", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(`🟢 Отправь доход:\n\n500000 Зарплата`);
});

bot.command("balance", async (ctx) => {
  try {
    return ctx.reply(await getStatsText(ctx.from.id), mainKeyboard(ctx.from.id));
  } catch (e) {
    console.error("BALANCE ERROR", e);
  }
});

bot.command("last", async (ctx) => {
  try {
    const state = await getUserState(ctx.from.id);
    const operations = Array.isArray(state.operations) ? state.operations.slice(0, 10) : [];

    if (!operations.length) {
      return ctx.reply("Операций пока нет.", mainKeyboard(ctx.from.id));
    }

    const text = operations
      .map((op, index) => {
        const sign = op.type === "income" ? "🟢" : "🔻";
        const amount = Number(op.amount || 0).toLocaleString("ru-RU");
        return `${index + 1}. ${sign} ${amount} ₸ — ${op.category || op.sheetCategory || "без категории"}`;
      })
      .join("\n");

    return ctx.reply(`Последние операции:\n\n${text}`, mainKeyboard(ctx.from.id));
  } catch (e) {
    console.error("LAST ERROR", e);
  }
});

bot.command("reset", async (ctx) => {
  try {
    await saveUserState(ctx.from.id, defaultState());
    return ctx.reply("Готово. Данные пользователя сброшены.", mainKeyboard(ctx.from.id));
  } catch (e) {
    console.error("RESET COMMAND ERROR", e);
  }
});

bot.command("add", async (ctx) => {
  const messageText = String(ctx.message.text || "").replace(/^\/add\s*/i, "-");
  ctx.message.text = messageText;
  return bot.handleUpdate(ctx.update);
});

bot.command("income", async (ctx) => {
  const messageText = String(ctx.message.text || "").replace(/^\/income\s*/i, "");
  ctx.message.text = messageText;
  return bot.handleUpdate(ctx.update);
});

/* ================= MESSAGE PARSER ================= */

bot.on("text", async (ctx) => {
  try {
    const text = String(ctx.message.text || "").trim();

    if (!text || text.startsWith("/")) return;

    const tgId = ctx.from.id;
    const match = text.match(/(-?\d+(?:[.,]\d+)?)/);

    if (!match) return;

    const rawAmount = Number(match[1].replace(",", "."));
    const amount = Math.abs(rawAmount);
    const type = rawAmount >= 0 ? "income" : "expense";
    const description = text.replace(match[1], "").trim();
    const operationCategory = description || (type === "income" ? "зарплата" : "Развлечения");
    const sheetCategory = detectSheetCategory(type, operationCategory);
    const state = await getUserState(tgId);
    const sheetKey = addValueToSheet(state, sheetCategory, amount);

    const operation = {
      id: `op_${Date.now()}`,
      amount,
      category: operationCategory,
      type,
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      sheetCategory,
      sheetKey
    };

    state.telegramConnected = true;
    state.operations.unshift(operation);

    await saveUserState(tgId, state);

    return ctx.reply(
      `✅ Добавлено\n\n${amount.toLocaleString("ru-RU")} ₸\nКатегория: ${operationCategory}\nТаблица: ${sheetCategory}\nЯчейка: ${sheetKey || "не найдена"}`,
      mainKeyboard(tgId)
    );
  } catch (e) {
    console.error("MESSAGE PARSER ERROR", e);
  }
});

/* ================= SERVER ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FinCenter server running on http://0.0.0.0:${PORT}`);
  console.log(`WEBAPP_URL=${WEBAPP_URL}`);
  console.log(`SITE_ORIGIN=${SITE_ORIGIN}`);
  console.log(`BOT_USERNAME=${BOT_USERNAME}`);
});

/* ================= BOT START ================= */

bot.launch({ dropPendingUpdates: true })
  .then(() => {
    console.log("Telegram bot launched");
  })
  .catch((e) => {
    console.error("BOT LAUNCH ERROR");
    console.error(e);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
