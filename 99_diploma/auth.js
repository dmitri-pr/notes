const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const res = await query('SELECT id, username FROM users WHERE id=$1', [id]);
    done(null, res.rows[0] || false);
  } catch (err) {
    done(err);
  }
});

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const oauthId = String(profile.id);
        const provider = 'github';
        const existing = await query('SELECT * FROM users WHERE oauth_provider=$1 AND oauth_id=$2', [provider, oauthId]);
        if (existing.rows.length) {
          return done(null, existing.rows[0]);
        }
        const id = uuidv4();
        const username = profile.username || profile.displayName || `gh_${oauthId}`;
        await query('INSERT INTO users(id, username, oauth_provider, oauth_id) VALUES($1,$2,$3,$4)', [id, username, provider, oauthId]);
        const created = (await query('SELECT id, username FROM users WHERE id=$1', [id])).rows[0];
        done(null, created);
      } catch (err) {
        done(err);
      }
    }
  ));
}

module.exports = passport;
