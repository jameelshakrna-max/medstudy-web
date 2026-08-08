import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs from 'sql.js'
import { handleSubscribe } from '../handlers/push.js'
import { D1Database } from './helpers/d1TestHarness.js'

let SQL
let db

function makeReq(subscription, userId) {
  return {
    json: async () => ({ subscription }),
    auth: null,
    userId,
  }
}

function makeEnv() {
  return { DB: db }
}

function subscribe(subscription, userSub) {
  return handleSubscribe(makeReq(subscription, userSub), makeEnv(), { sub: userSub })
}

async function rows() {
  return (await db.prepare('SELECT * FROM push_subscriptions ORDER BY id').all()).results
}

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/medstudy-e2e-test-endpoint',
  keys: { p256dh: 'aGVsbG8=', auth: 'd29ybGQ=' },
  expirationTime: null,
}

beforeAll(async () => {
  SQL = await initSqlJs()
  db = new D1Database(new SQL.Database())
  db.run(`CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
})

describe('handleSubscribe', () => {
  it('creates exactly one row for a new subscription', async () => {
    const res = await subscribe(SUB, 'user-a')
    expect(res.status).toBe(200)
    const all = await rows()
    expect(all.length).toBe(1)
    expect(all[0].user_id).toBe('user-a')
    expect(all[0].endpoint).toBe(SUB.endpoint)
    expect(all[0].p256dh).toBe(SUB.keys.p256dh)
    expect(all[0].auth).toBe(SUB.keys.auth)
  })

  it('re-sync from the same user does not create duplicates and updates in place', async () => {
    const updated = { ...SUB, keys: { p256dh: 'Y2hhbmdlZA==', auth: 'bmV3' }, expirationTime: 12345 }
    const res = await subscribe(updated, 'user-a')
    expect(res.status).toBe(200)
    const all = await rows()
    expect(all.length).toBe(1)
    expect(all[0].user_id).toBe('user-a')
    expect(all[0].p256dh).toBe(updated.keys.p256dh)
    expect(all[0].auth).toBe(updated.keys.auth)
    expect(all[0].expiration_time).toBe(12345)
  })

  it('another user cannot overwrite an existing subscription (409, row untouched)', async () => {
    const res = await subscribe(SUB, 'user-b')
    expect(res.status).toBe(409)
    const all = await rows()
    expect(all.length).toBe(1)
    expect(all[0].user_id).toBe('user-a')
    expect(all[0].p256dh).toBe('Y2hhbmdlZA==')
  })

  it('rejects invalid subscription payloads with 400', async () => {
    const res = await subscribe({ endpoint: 'https://x.example', keys: {} }, 'user-a')
    expect(res.status).toBe(400)
  })

  it('allows a user to register multiple distinct endpoints', async () => {
    const second = { ...SUB, endpoint: SUB.endpoint + '/second-device' }
    const res = await subscribe(second, 'user-a')
    expect(res.status).toBe(200)
    const all = await rows()
    expect(all.length).toBe(2)
    expect(all.filter((r) => r.user_id === 'user-a').length).toBe(2)
  })
})
