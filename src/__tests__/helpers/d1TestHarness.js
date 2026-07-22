import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadMigrationSql() {
  return readFileSync(
    resolve(__dirname, '../../../schema-migration13.sql'),
    'utf8'
  )
}

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
  }

  prepare(sql) {
    return new D1PreparedStatement(this._db, sql, [])
  }

  async batch(statements) {
    this._db.run('BEGIN')
    try {
      const results = []
      for (const stmt of statements) {
        const result = await stmt.run()
        results.push(result)
      }
      this._db.run('COMMIT')
      return results
    } catch (e) {
      this._db.run('ROLLBACK')
      throw e
    }
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
  return new D1Database(sqlJsDb)
}

export { D1Database, D1PreparedStatement }
