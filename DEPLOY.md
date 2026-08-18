# Деплой Sunless на VDS (nginx + PostgreSQL)

## Часть 1. Локально — сборка бекенда

1. Открой папку проекта, запусти `build.bat` (дважды кликни).
2. Он поставит зависимости, проверит синтаксис и соберёт папку `dist/` — это пакет для сервера.
3. Скопируй `dist/` на VDS:
   ```
   scp -r dist root@ТВОЙ_IP:/home/backend
   ```

## Часть 2. На VDS — установка ПО

```bash
sudo apt update && sudo apt install -y nginx postgresql postgresql-contrib
# Node.js 18+ (если ещё нет):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## Часть 3. База данных (схема из `wissend.sql`)

```bash
sudo -u postgres psql
CREATE DATABASE sunless_db OWNER postgres;
\q

sudo -u postgres psql -d sunless_db -f /home/backend/wissend.sql
```

В схеме уже создан админ: **coderdlc / Sunless-Admin-2026** (смени пароль после первого входа или через `\i` — лучше сразу):
```bash
sudo -u postgres psql -d sunless_db -c "UPDATE users SET email='твой@email' WHERE username='coderdlc';"
```

## Часть 4. Бекенд

```bash
cd /home/backend
npm ci
nano .env        # скопируй содержимое .env.example, пропиши DATABASE_URL и SITE_URL
PORT=1000 DATABASE_URL='postgres://postgres:ПАРОЛЬ@localhost:5432/sunless_db' SITE_URL='https://domain.com' ADMIN_USERS=coderdlc npm start
```

Проверка: `curl http://localhost:1000/api/altcha/challenge` → должен вернуть JSON.

> Чтобы бекенд работал всегда (после перезагрузки сервера), сделай systemd-сервис:
> ```
> sudo nano /etc/systemd/system/sunless.service
> ```
> ```ini
> [Unit]
> Description=Sunless backend
> After=network.target postgresql.service
>
> [Service]
> WorkingDirectory=/home/backend
> EnvironmentFile=/home/backend/.env
> ExecStart=/usr/bin/node server.js
> Restart=always
>
> [Install]
> WantedBy=multi-user.target
> ```
> Затем: `sudo systemctl enable --now sunless`

## Часть 5. Nginx (фронт + редирект /api/)

1. Положи фронт (сайт: `index.html`, `assets/`, `fonts/`) в `/var/www/site`:
   ```bash
   sudo mkdir -p /var/www/site
   sudo cp -r index.html assets fonts /var/www/site/
   ```
2. Конфиг уже готов — `nginx-default.conf` (в `dist/`). Скопируй и пропиши домен:
   ```bash
   sudo cp /home/backend/nginx-default.conf /etc/nginx/sites-available/default
   sudo nano /etc/nginx/sites-available/default   # замени domain.com на свой домен
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. SSL (по желанию): `sudo certbot --nginx -d domain.com -d www.domain.com`

Проверка: `https://domain.com/api/altcha/challenge` → JSON.

## Часть 6. Фронт и лаунчер — домен

Бандлы сайта и лаунчера сейчас указывают на `sunlesss.vercel.app`. Для VDS замени это на свой домен:
- `assets/index-BY_pv7R6.js` — строка `lo="sunlesss.vercel.app"`
- `sunlessloader/web/static/js/main.8b1b6cf6.js` — `baseURL:"https://sunlesss.vercel.app/api"`

Затем пересобери лаунчер (`sunlessloader` → `dotnet publish`) и залей клиент через админку сайта (`/zaliv/*`).

## Что где лежит

| Файл | Назначение |
|---|---|
| `db.js` | Слой БД: авто-выбор PostgreSQL / Turso / SQLite |
| `wissend.sql` | Схема PostgreSQL + seed (админ, ключи) |
| `nginx-default.conf` | Конфиг Nginx: фронт + `/api/` → `localhost:1000` |
| `.env.example` | Переменные окружения бекенда |
| `build.bat` | Сборка `dist/` для заливки на VDS |