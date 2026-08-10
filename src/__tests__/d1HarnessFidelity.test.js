// @vitest-environment node
// Verifies the D1 test harness `batch()` is faithful to real D1 semantics:
// - SELECT batches return the `results` array correctly
// - mutations report `meta.changes` / `meta.changed_db` / `meta.last_row_id`
// - transaction failure rolls the whole batch back
// - result ordering matches statement ordering
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/d1TestHarness.js'

function insertCard(db, id, userId) {
  return db.prepare(
    "INSERT INTO flashcards (id, user_id, front, back) VALUES (?, ?, 'front', 'back')"
  ).bind(id, userId)
}

describe('D1 test harness batch() fidelity', () => {
  it('B + G: INSERT batches report changes=1 and preserve statement order', async () => {
    const db = await createTestDb()
    const res = await db.batch([insertCard(db, 'c1', 'u1'), insertCard(db, 'c2', 'u1')])

    expect(res).toHaveLength(2)
    expect(res[0].meta.changes).toBe(1)
    expect(res[0].meta.changed_db).toBe(true)
    expect(res[1].meta.changes).toBe(1)
    expect(res[1].results).toEqual([])
  })

  it('A: SELECT batch returns the results array correctly', async () => {
    const db = await createTestDb()
    await db.batch([insertCard(db, 'c1', 'u1'), insertCard(db, 'c2', 'u1')])

    const sel = await db.batch([
      db.prepare('SELECT id, front FROM flashcards WHERE user_id = ? ORDER BY id').bind('u1'),
    ])
    expect(sel).toHaveLength(1)
    expect(sel[0].results.map((r) => r.id)).toEqual(['c1', 'c2'])
    expect(sel[0].results[0].front).toBe('front')
  })

  it('C: UPDATE with a matching row reports changes=1 and changed_db=true', async () => {
    const db = await createTestDb()
    await db.batch([insertCard(db, 'c1', 'u1')])

    const res = await db.batch([
      db.prepare("UPDATE flashcards SET back = 'edited' WHERE id = 'c1'"),
    ])
    expect(res[0].meta.changes).toBe(1)
    expect(res[0].meta.changed_db).toBe(true)

    const after = await db.batch([db.prepare("SELECT back FROM flashcards WHERE id = 'c1'")])
    expect(after[0].results[0].back).toBe('edited')
  })

  it('D: UPDATE with no matching row reports changes=0 and changed_db=false', async () => {
    const db = await createTestDb()
    const res = await db.batch([
      db.prepare("UPDATE flashcards SET back = 'x' WHERE id = 'missing'"),
    ])
    expect(res[0].meta.changes).toBe(0)
    expect(res[0].meta.changed_db).toBe(false)
  })

  it('E: DELETE reports the correct change count', async () => {
    const db = await createTestDb()
    await db.batch([insertCard(db, 'c1', 'u1'), insertCard(db, 'c2', 'u1'), insertCard(db, 'c3', 'u1')])

    const res = await db.batch([
      db.prepare("DELETE FROM flashcards WHERE user_id = 'u1'"),
    ])
    expect(res[0].meta.changes).toBe(3)
    expect(res[0].meta.changed_db).toBe(true)

    const after = await db.batch([db.prepare("SELECT COUNT(*) AS n FROM flashcards WHERE user_id = 'u1'")])
    expect(after[0].results[0].n).toBe(0)
  })

  it('G: mixed-statement batch keeps statement ordering and shape', async () => {
    const db = await createTestDb()
    const res = await db.batch([
      insertCard(db, 'c1', 'u1'),
      insertCard(db, 'c2', 'u1'),
      db.prepare("SELECT id FROM flashcards WHERE user_id = 'u1' ORDER BY id"),
      insertCard(db, 'c3', 'u1'),
    ])

    expect(res).toHaveLength(4)
    expect(res[0].meta.changes).toBe(1)
    expect(res[1].meta.changes).toBe(1)
    expect(res[2].results.map((r) => r.id)).toEqual(['c1', 'c2'])
    expect(res[3].meta.changes).toBe(1)
  })

  it('F: transaction failure rolls the batch back', async () => {
    const db = await createTestDb()
    await expect(
      db.batch([
        insertCard(db, 'rk1', 'u1'),
        db.prepare('INSERT INTO no_such_table (x) VALUES (1)'),
      ])
    ).rejects.toThrow()

    const after = await db.batch([db.prepare("SELECT id FROM flashcards WHERE id = 'rk1'")])
    expect(after[0].results).toEqual([])
  })
})
