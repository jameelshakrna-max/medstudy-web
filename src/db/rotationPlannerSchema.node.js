import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let _dirname
function getDirname() {
  if (_dirname === undefined) {
    _dirname = dirname(fileURLToPath(import.meta.url))
  }
  return _dirname
}

export function getMigrationSql() {
  return readFileSync(
    resolve(getDirname(), '../../schema-migration13.sql'),
    'utf8'
  )
}

export function getMigration14Sql() {
  return readFileSync(
    resolve(getDirname(), '../../schema-migration14.sql'),
    'utf8'
  )
}
