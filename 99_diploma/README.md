# SkillNotes

Веб-приложение для создания и управления заметками с поддержкой:

- регистрации и авторизации пользователей
- GitHub OAuth
- архивирования заметок
- полнотекстового поиска (PostgreSQL FTS)
- генерации PDF

---

# Использующиеся технологии

## Backend

- Node.js
- Express
- PostgreSQL
- express-session
- connect-pg-simple
- Passport.js (GitHub OAuth)
- Puppeteer (генерация PDF)

## Frontend

- Svelte
- svelte-spa-router
- EasyMDE (Markdown editor)

---

# Требования

- Node.js (рекомендуется 16+)
- npm
- PostgreSQL (локально или удалённая БД)

---

# Установка проекта

## 1. Клонирование

```bash
git clone <repo_url>
```

## 2. Установка зависимостей

```bash
npm install
```

## 3. Создание файла .env

Создайте файл `.env` в корне проекта.

Пример:

```env
PORT=3000

PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=skillnotes

SESSION_SECRET=long_random_secret

GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

⚠ Файл `.env` не должен попадать в git.

---

# Подготовка базы данных

## 1. Создать базу данных

Подключитесь к PostgreSQL и выполните:

```sql
CREATE DATABASE skillnotes;
```

## 2. Таблицы создаются автоматически

При запуске сервера вызывается функция `init()` из `db.js`, которая:

- создаёт таблицу `users`
- создаёт таблицу `notes`
- создаёт таблицу `session`
- создаёт индексы
- создаёт GIN-индекс для полнотекстового поиска

Дополнительных ручных действий не требуется.

Если таблицы уже существуют — используется `CREATE TABLE IF NOT EXISTS`.

---

# Запуск проекта

## Режим разработки

```bash
npm run dev
```

(если настроен nodemon)

## Обычный запуск

```bash
npm start
```

Сервер будет доступен по адресу:

```
http://localhost:3000
```

---

# GitHub OAuth

Для работы авторизации через GitHub:

1. Перейти на https://github.com/settings/developers
2. Создать **OAuth App**
3. Указать:

```
Homepage URL:
http://localhost:3000

Authorization callback URL:
http://localhost:3000/auth/github/callback
```

4. Скопировать `Client ID` и `Client Secret` в `.env`

Для production необходимо зарегистрировать отдельное приложение или добавить production callback URL.

---

# Архивирование заметок

Заметки можно:

- архивировать
- восстанавливать из архива
- удалять (только если архивированы)
- удалить весь архив

Флаг хранения в БД:

```
is_archived boolean
```

---

# Полнотекстовый поиск

Используется PostgreSQL Full Text Search.

Поддерживаются конфигурации:

- english
- russian
- simple

Создаётся GIN-индекс для ускорения поиска по заголовкам.

Подсветка совпадений выполняется через `ts_headline`.

---

# Генерация PDF

Маршрут:

```
GET /api/notes/:id/pdf
```

PDF:

- генерируется через Puppeteer
- формируется в памяти (Buffer)
- не создаёт временных файлов
- имя файла санитизируется функцией:

```js
function sanitizeFilename(filename) {
  return (filename || "note").replace(/[^a-z0-9_.-]/gi, "_") + ".pdf";
}
```

---

# Структура проекта

```
frontend-src/
  App.svelte
  Main.svelte
  NoteView.svelte
  NoteEdit.svelte
  NoteNew.svelte
  api.js
  lib.js

views/
  index.njk
  dashboard.njk
  _layout.njk

public/
  bundle.js
  bundle.css

index.js
db.js
package.json
rollup.config.js
```

---

# Сборка фронтенда

```bash
npm run build
```

Результат:

```
public/bundle.js
public/bundle.css
```

---

# Проверка работоспособности

После запуска:

1. Перейти на http://localhost:3000
2. Зарегистрироваться
3. Создать заметку
4. Архивировать
5. Проверить фильтр "архив"
6. Восстановить заметку
7. Скачать PDF

---
