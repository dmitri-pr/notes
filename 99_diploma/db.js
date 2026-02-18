const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      oauth_provider TEXT,
      oauth_id TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      text TEXT,
      html TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      is_archived BOOLEAN DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "IDX_session_expire"
    ON "session" ("expire");
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'notes_title_tsv_idx') THEN
        CREATE INDEX notes_title_tsv_idx ON notes USING GIN (
          (
            setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
            setweight(to_tsvector('russian', coalesce(title,'')), 'A') ||
            setweight(to_tsvector('simple',  coalesce(title,'')), 'B')
          )
        );
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION trigger_set_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_trigger') THEN
        CREATE TRIGGER set_timestamp_trigger
        BEFORE UPDATE ON notes
        FOR EACH ROW
        EXECUTE PROCEDURE trigger_set_timestamp();
      END IF;
    END
    $$;
  `);
}

module.exports = { pool, query, init };
