const { createClient } = require('@libsql/client');
const fs = require('fs');
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0,i).trim()] = l.slice(i+1).trim();
});
console.log('TURSO_DATABASE_URL found:', !!env.TURSO_DATABASE_URL);
console.log('TURSO_AUTH_TOKEN found:', !!env.TURSO_AUTH_TOKEN);
const t = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
t.execute("SELECT name FROM sqlite_master WHERE type='table'")
  .then(r => console.log('Tables:', r.rows.map(x => x.name)))
  .then(() => t.execute("SELECT sql FROM sqlite_master WHERE name='anki_cards'"))
  .then(r => console.log('Cards schema:', r.rows[0]?.sql || 'NOT FOUND'))
  .then(() => t.execute("SELECT sql FROM sqlite_master WHERE name='anki_decks'"))
  .then(r => console.log('Decks schema:', r.rows[0]?.sql || 'NOT FOUND'))
  .catch(e => console.error('Error:', e.message));
