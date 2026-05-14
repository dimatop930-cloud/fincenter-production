# FinCenter Fixed — Telegram + Firebase full sync

## Что изменено

- `finance-bot.js` теперь содержит:
  - Telegram bot;
  - Express backend;
  - `/api/auth/telegram` для Telegram Login Widget и Telegram WebApp `initData`;
  - Firebase Custom Auth через `createCustomToken`;
  - `/api/state` для общей синхронизации сайта и бота;
  - `/api/reset`;
  - `/health`.

- `public/index.html` теперь содержит:
  - Google-вход как раньше;
  - отдельный Telegram-вход через Telegram Login Widget;
  - автоматический Telegram-вход внутри Telegram WebApp через серверную проверку `initData`;
  - сохранение и загрузку данных по тому же Firebase UID.

## Важно по безопасности

`firebase-admin.json` не добавлен в архив специально. Это секретный service account key.
Локально положи свой `firebase-admin.json` рядом с `finance-bot.js`.
На Railway/Render лучше положить весь JSON в переменную `FIREBASE_SERVICE_ACCOUNT`.

## Запуск локально

```bash
npm install
copy .env.example .env
npm start
```

## Проверка синтаксиса

```bash
npm run check
```

## ENV

```env
PORT=8080
BOT_TOKEN=PASTE_TELEGRAM_BOT_TOKEN_HERE
BOT_USERNAME=my_rashodi_bot
WEBAPP_URL=https://fincenter-pro.web.app
SITE_ORIGIN=https://fincenter-pro.web.app
FIREBASE_SERVICE_ACCOUNT=
```

## Что заливать на официальный сайт

Файл сайта:
```text
public/index.html
```

Если сайт у тебя Firebase Hosting, положи этот файл в папку `public`, затем:

```bash
firebase deploy --only hosting
```

## Что заливать на backend / Railway

Файлы:
```text
finance-bot.js
index.js
package.json
package-lock.json
.env.example
firebase-admin.example.json
.gitignore
public/index.html
```
