const express = require('express');
const { query } = require('../db');
const { v4: uuidv4 } = require('uuid');
const marked = require('marked');
const puppeteer = require('puppeteer-core');
// const puppeteer = require('puppeteer');

const router = express.Router();
const PAGE_SIZE = 20;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (match) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match];
  });
}

function sanitizeFilename(filename) {
  return (filename || 'note').replace(/[^a-z0-9_\-.]/gi, '_') + '.pdf';
}

function ensureAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function highlightTitle(title, term) {
  if (!term || !title) return title;
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return title.replace(re, '<mark>$1</mark>');
}

router.get('/', ensureAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const allowedAges = new Set(['1week', '1month', '3months', 'alltime', 'archive']);
    let age = (req.query.age || '').trim();
    if (!allowedAges.has(age)) age = '1week';
    const page = Math.max(1, Number(req.query.page) || 1);
    const search = (req.query.search || '').trim();

    let where = ['user_id = $1'];
    let params = [userId];
    let idx = 2;

    if (age !== 'archive') where.push('is_archived = false');
    else where.push('is_archived = true');

    if (age === '1week') {
      where.push(`created_at >= now() - interval '1 week'`);
    } else if (age === '1month') {
      where.push(`created_at >= now() - interval '1 month'`);
    } else if (age === '3months') {
      where.push(`created_at >= now() - interval '3 months'`);
    }

    let selectHead = `
      id as _id,
      title,
      created_at as created,
      is_archived as "isArchived",
      NULL as highlights
    `;

    if (search) {
      selectHead = `
        id as _id,
        title,
        created_at as created,
        is_archived as "isArchived",
        ts_headline(
          'simple',
          coalesce(title,''),
          (
            plainto_tsquery('english', $${idx}) ||
            plainto_tsquery('russian', $${idx}) ||
            plainto_tsquery('simple',  $${idx})
          ),
          'StartSel=<mark>, StopSel=</mark>'
        ) as highlights
      `;

      params.push(search);

      where.push(`
        (
          setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
          setweight(to_tsvector('russian', coalesce(title,'')), 'A') ||
          setweight(to_tsvector('simple',  coalesce(title,'')), 'B')
        )
        @@
        (
          plainto_tsquery('english', $${idx}) ||
          plainto_tsquery('russian', $${idx}) ||
          plainto_tsquery('simple',  $${idx})
        )
      `);
    }

    const offset = (page - 1) * PAGE_SIZE;

    const qry = `
      SELECT ${selectHead}
      FROM notes
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE + 1}
      OFFSET ${offset}
    `;

    const rawRows = await query(qry, params);

    const rows = rawRows.rows.map(row => {
      let highlights = row.highlights;

      if (search && !highlights) {
        highlights = highlightTitle(row.title, search);
      }

      return {
        _id: row._id,
        title: row.title,
        created: row.created,
        isArchived: row.is_archived,
        highlights
      };
    });

    const hasMore = rows.length > PAGE_SIZE;
    if (hasMore) rows.pop();

    res.json({ data: rows, hasMore });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', ensureAuth, async (req, res) => {
  const { title = '', text = '' } = req.body || {};
  const html = marked.parse(text || '');
  const id = uuidv4();

  await query(
    'INSERT INTO notes(id, user_id, title, text, html) VALUES($1,$2,$3,$4,$5)',
    [id, req.session.userId, title, text, html]
  );

  res.json({ _id: id, title, text, html });
});

router.get('/:id', ensureAuth, async (req, res) => {
  const result = await query(
    'SELECT id as _id, title, text, html, created_at as created, is_archived "isArchived" FROM notes WHERE id=$1 AND user_id=$2',
    [req.params.id, req.session.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.put('/:id', ensureAuth, async (req, res) => {
  const { title = '', text = '' } = req.body || {};
  const html = marked.parse(text || '');

  const result = await query(
    'UPDATE notes SET title=$1, text=$2, html=$3 WHERE id=$4 AND user_id=$5 RETURNING id as _id, title, text, html',
    [title, text, html, req.params.id, req.session.userId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.post('/:id/archive', ensureAuth, async (req, res) => {
  await query(
    'UPDATE notes SET is_archived=true WHERE id=$1 AND user_id=$2',
    [req.params.id, req.session.userId]
  );
  res.json({ ok: true });
});

router.post('/:id/unarchive', ensureAuth, async (req, res) => {
  await query(
    'UPDATE notes SET is_archived=false WHERE id=$1 AND user_id=$2',
    [req.params.id, req.session.userId]
  );
  res.json({ ok: true });
});

router.delete('/:id', ensureAuth, async (req, res) => {
  const result = await query(
    'DELETE FROM notes WHERE id=$1 AND user_id=$2 AND is_archived=true RETURNING id',
    [req.params.id, req.session.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found or not archived' });
  res.json({ ok: true });
});

router.delete('/', ensureAuth, async (req, res) => {
  const result = await query(
    'DELETE FROM notes WHERE user_id=$1 AND is_archived=true RETURNING id',
    [req.session.userId]
  );
  res.json({ deleted: result.rowCount });
});

router.get('/:id/pdf', ensureAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await query('SELECT title, html FROM notes WHERE id=$1 AND user_id=$2', [id, req.session.userId]);
    if (!result.rows.length) return res.status(404).send('Not found');
    const note = result.rows[0];

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(note.title || 'Note')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; max-width: 800px; margin: auto; }
          h1 { font-size: 24px; }
          .content { margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(note.title || '')}</h1>
        <div class="content">${note.html || ''}</div>
      </body>
      </html>
    `;

    // const browser = await puppeteer.launch({
    //   headless: 'new',
    //   args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    // });
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(note.title || 'note')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal error');
  }
});

module.exports = router;
