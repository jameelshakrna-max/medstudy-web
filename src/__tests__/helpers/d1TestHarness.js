import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadMigrationSql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration13.sql'), 'utf8')
    + '\n'
    + readFileSync(resolve(__dirname, '../../../schema-migration14.sql'), 'utf8')
    + '\n'
    + readFileSync(resolve(__dirname, '../../../schema-migration15.sql'), 'utf8')
}

function loadMigration16Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration16.sql'), 'utf8')
}

function loadMigration17Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration17.sql'), 'utf8')
}

function loadMigration18Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration18.sql'), 'utf8')
}

function loadMigration19Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration19.sql'), 'utf8')
}

function loadMigration20Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration20.sql'), 'utf8')
}

function loadMigration21Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration21.sql'), 'utf8')
}

function loadMigration22Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration22.sql'), 'utf8')
}

function loadMigration23Sql() {
  return readFileSync(resolve(__dirname, '../../../schema-migration23.sql'), 'utf8')
}

const FLASHCARDS_STUB = `
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_name TEXT NOT NULL DEFAULT '',
  state INTEGER NOT NULL DEFAULT 0,
  last_review TEXT,
  next_review TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`

class D1PreparedStatement {
  constructor(db, sql, bindings) {
    this._db = db
    this._sql = sql
    this._bindings = bindings
  }

  bind(...values) {
    return new D1PreparedStatement(this._db, this._sql, values)
  }

  async all() {
    try {
      const stmt = this._db.prepare(this._sql)
      if (this._bindings.length > 0) {
        stmt.bind(this._bindings)
      }
      const rows = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
      return { results: rows, success: true }
    } catch (e) {
      throw new Error(e.message)
    }
  }

  async first() {
    const { results } = await this.all()
    return results[0] || null
  }

  async run() {
    try {
      this._db.run(this._sql, this._bindings)
      return {
        success: true,
        meta: {
          changed_db: false,
          changes: this._db.getRowsModified(),
          last_row_id: this._db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0,
        },
      }
    } catch (e) {
      throw new Error(e.message)
    }
  }
}

class D1Database {
  constructor(sqlJsDb) {
    this._db = sqlJsDb
    this._queue = Promise.resolve()
    this._inBatch = false
  }

  prepare(sql) {
    return new D1PreparedStatement(this._db, sql, [])
  }

  async batch(statements) {
    if (this._inBatch) {
      throw new Error('Nested D1 batch calls are not allowed')
    }
    const resultPromise = new Promise((resolve, reject) => {
      this._queue = this._queue.then(async () => {
        this._inBatch = true
        try {
          this._db.run('BEGIN')
          const results = []
          for (const stmt of statements) {
            const result = await stmt.run()
            results.push(result)
          }
          this._db.run('COMMIT')
          resolve(results)
        } catch (e) {
          try { this._db.run('ROLLBACK') } catch (_) {}
          reject(e)
        } finally {
          this._inBatch = false
        }
      }).catch(() => {})
    })
    return resultPromise
  }

  exec(sql) {
    return this._db.exec(sql)
  }

  run(sql, bindings) {
    return this._db.run(sql, bindings)
  }
}

export async function createTestDb() {
  const SQL = await initSqlJs()
  const sqlJsDb = new SQL.Database()
  sqlJsDb.run('PRAGMA foreign_keys = ON')
  sqlJsDb.run(loadMigrationSql())
  sqlJsDb.run(FLASHCARDS_STUB)
  sqlJsDb.run(loadMigration16Sql())
  sqlJsDb.run(loadMigration17Sql())
  sqlJsDb.run(loadMigration18Sql())
  sqlJsDb.run(loadMigration19Sql())
  sqlJsDb.run(loadMigration20Sql())
  sqlJsDb.run(loadMigration21Sql())
  sqlJsDb.run(loadMigration22Sql())
  sqlJsDb.run(loadMigration23Sql())
  return new D1Database(sqlJsDb)
}

export { D1Database, D1PreparedStatement, loadMigration20Sql, loadMigration21Sql, loadMigration22Sql, loadMigration23Sql }
