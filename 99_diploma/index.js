const express = require('express');
const nunjucks = require('nunjucks');
const session = require('express-session');
const PGStore = require('connect-pg-simple')(session);
const bodyParser = require('body-parser');
const passport = require('./auth');
const { pool, query, init } = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const marked = require('marked');
const notesApi = require('./routes/api_notes');
require('dotenv').config();

const app = express();

nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

app.set('view engine', 'njk');

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(session({
  store: new PGStore({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'some_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

init().then(() => {
  console.log('DB initialized');
}).catch(err => {
  console.error('DB init error', err);
  process.exit(1);
});

function ensureLoggedIn(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/');
  }
  next();
}

app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('index.njk', { authError: null });
});

app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.render('index.njk', { authError: 'Имя пользователя и пароль обязательны' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await query('INSERT INTO users(id, username, password_hash) VALUES($1,$2,$3)', [id, username, hashed]);

    req.session.userId = id;
    req.session.username = username;

    const demoText = `
# Demo

Добро пожаловать в SkillNotes!

Эта заметка демонстрирует возможности **Markdown**.

## Форматирование

- *Курсив*
- **Жирный текст**
- ~~Зачёркнутый~~

## Список задач

- [x] Создать заметку
- [x] Отредактировать
- [x] Архивировать
- [x] Скачать в PDF

## Цитата

> SkillNotes помогает быстро сохранять мысли.

## Код

\`\`\`js
console.log('Hello, SkillNotes!');
\`\`\`

## Таблица

| Возможность | Поддержка |
|--------------|-----------|
| Markdown     | ✅ |
| Архив        | ✅ |
| PDF экспорт  | ✅ |
    `;
    const html = marked.parse(demoText);
    const noteId = uuidv4();
    await query('INSERT INTO notes(id, user_id, title, text, html) VALUES($1,$2,$3,$4,$5)', [noteId, id, 'Demo', demoText, html]);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('index.njk', { authError: 'Ошибка регистрации: ' + err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.render('index.njk', { authError: 'Введите имя и пароль' });
    }
    const result = await query('SELECT id, password_hash FROM users WHERE username=$1', [username]);
    if (!result.rows.length) {
      return res.render('index.njk', { authError: 'Неправильные учётные данные' });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      return res.render('index.njk', { authError: 'Неправильные учётные данные' });
    }
    req.session.userId = user.id;
    req.session.username = username;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('index.njk', { authError: 'Ошибка: ' + err.message });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/dashboard', ensureLoggedIn, (req, res) => {
  res.render('dashboard.njk', { username: req.session.username || 'User' });
});

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/' }), async (req, res) => {
  req.session.userId = req.user.id;
  req.session.username = req.user.username;

  try {
    const result = await query('SELECT id FROM notes WHERE user_id=$1 LIMIT 1', [req.user.id]);
    if (!result.rows.length) {
      const demoText = `
# Demo

Добро пожаловать в SkillNotes!

Эта заметка демонстрирует возможности **Markdown**.

## Форматирование

- *Курсив*
- **Жирный текст**
- ~~Зачёркнутый~~

## Список задач

- [x] Создать заметку
- [x] Отредактировать
- [x] Архивировать
- [x] Скачать в PDF

## Цитата

> SkillNotes помогает быстро сохранять мысли.

## Код

\`\`\`js
console.log('Hello, SkillNotes!');
\`\`\`

## Таблица

| Возможность | Поддержка |
|--------------|-----------|
| Markdown     | ✅ |
| Архив        | ✅ |
| PDF экспорт  | ✅ |
`;
      const html = marked.parse(demoText);
      const noteId = uuidv4();
      await query('INSERT INTO notes(id, user_id, title, text, html) VALUES($1,$2,$3,$4,$5)', [noteId, req.user.id, 'Demo', demoText, html]);
    }
  } catch (err) {
    console.error('Error creating demo note for oauth user', err);
  }
  res.redirect('/dashboard');
});

app.use('/api/notes', notesApi);

app.use((req, res) => {
  res.status(404).send('Not found');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server started at ${process.env.BASE_URL || 'http://localhost:' + port}`);
});
