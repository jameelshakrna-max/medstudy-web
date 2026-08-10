#!/usr/bin/env node
// READ-ONLY D1 schema audit (predeploy guard).
//
// Usage:
//   node scripts/audit-d1-schema.mjs --env staging
//   node scripts/audit-d1-schema.mjs --env production
//
// Optional overrides:
//   --config <path>   wrangler config file (defaults per environment)
//   --db <name>       D1 database name (defaults per environment)
//
// Behavior:
//   - Issues only SELECT / PRAGMA statements. Never applies migrations.
//   - Fails (exit code 1) if required schema is missing or if
//     PRAGMA foreign_key_check returns any rows.
//   - Never prints credentials or secrets.
import { spawnSync } from 'node:child_process'

const REQUIRED_TABLES = [
  'community_members',
  'rotation_planner_plans',
  'rotation_planner_plan_decks',
  'rotation_planner_flashcard_task_cards',
]

const REQUIRED_COLUMNS = {
  community_members: ['title', 'last_seen_at'],
  rotation_planner_plans: ['display_name', 'activated_at', 'paused_at', 'completed_at'],
}

const ENV_CONFIG = {
  staging: { config: 'wrangler-staging.toml', db: 'medstudy-db-staging' },
  production: { config: 'wrangler.toml', db: 'medstudy-db' },
}

function parseArgs(argv) {
  const args = { env: null, config: null, db: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--env') args.env = argv[++i]
    else if (arg === '--config') args.config = argv[++i]
    else if (arg === '--db') args.db = argv[++i]
  }
  return args
}

function runQuery({ db, config, sql }) {
  const safe = sql.trim()
  if (!/^(SELECT|PRAGMA)\b/i.test(safe)) {
    throw new Error(`Refusing to run non-read-only statement: ${safe}`)
  }
  const isWin = process.platform === 'win32'
  const commandArg = isWin ? `--command="${safe}"` : `--command=${safe}`
  const res = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      db,
      '--remote',
      `--config=${config}`,
      commandArg,
      '--json',
    ],
    { encoding: 'utf8', shell: isWin }
  )
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim()
    throw new Error(`wrangler d1 execute failed (${db}): ${stderr || res.stdout || `exit ${res.status}`}`)
  }
  const stdout = (res.stdout || '').trim()
  const jsonStart = stdout.indexOf('[')
  if (jsonStart === -1) {
    throw new Error(`wrangler returned no JSON for ${db}: ${stdout.slice(0, 200)}`)
  }
  return JSON.parse(stdout.slice(jsonStart))
}

function collectResultRows(out) {
  const rows = []
  for (const entry of Array.isArray(out) ? out : [out]) {
    if (entry && Array.isArray(entry.results)) rows.push(...entry.results)
  }
  return rows
}

function getColumnNames(out) {
  return new Set(collectResultRows(out).map((r) => r.name).filter((n) => typeof n === 'string'))
}

function audit({ db, config, verbose }) {
  const problems = []

  const tablesOut = runQuery({
    db,
    config,
    sql:
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" +
      REQUIRED_TABLES.map((t) => `'${t}'`).join(',') +
      ')',
  })
  const present = new Set(collectResultRows(tablesOut).map((r) => r.name))
  for (const table of REQUIRED_TABLES) {
    if (!present.has(table)) problems.push(`missing table: ${table}`)
  }

  const infoOut = runQuery({
    db,
    config,
    sql: 'PRAGMA table_info(community_members)',
  })
  const fkOut = runQuery({ db, config, sql: 'PRAGMA table_info(rotation_planner_plans)' })
  const columnsByTable = new Map()
  columnsByTable.set('community_members', getColumnNames(infoOut))
  columnsByTable.set('rotation_planner_plans', getColumnNames(fkOut))

  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const have = new Set(columnsByTable.get(table) || [])
    for (const col of required) {
      if (!have.has(col)) problems.push(`missing column: ${table}.${col}`)
    }
  }

  const fkCheckOut = runQuery({ db, config, sql: 'PRAGMA foreign_key_check' })
  const fkViolations = collectResultRows(fkCheckOut)
  if (fkViolations.length > 0) {
    const first = fkViolations[0]
    problems.push(
      `foreign key violations: ${fkViolations.length} row(s) ` +
        `(e.g. table=${first.table}, rowid=${first.rowid}, parent=${first.parent})`
    )
  }

  return { problems, present: [...present].sort(), fkViolations: fkViolations.length }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.env || !ENV_CONFIG[args.env]) {
    console.error('usage: node scripts/audit-d1-schema.mjs --env <staging|production>')
    process.exit(2)
  }
  const cfg = ENV_CONFIG[args.env]
  const config = args.config || cfg.config
  const db = args.db || cfg.db

  console.log(`\naudit-d1-schema: ${args.env} (db=${db}, config=${config})`)
  let result
  try {
    result = audit({ db, config, verbose: false })
  } catch (err) {
    console.error(`FAILED to run audit for ${args.env}: ${err.message}`)
    process.exit(1)
  }

  const ok = result.problems.length === 0
  console.log(`  tables present: ${result.present.join(', ') || '(none)'}`)
  console.log(`  foreign_key_check: ${result.fkViolations === 0 ? 'clean' : `${result.fkViolations} violation(s)`}`)
  if (ok) {
    console.log(`  ${args.env}: PASS`)
  } else {
    console.error(`  ${args.env}: FAIL`)
    for (const p of result.problems) console.error(`    - ${p}`)
  }
  process.exit(ok ? 0 : 1)
}

main()
