import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../__tests__/helpers/d1TestHarness.js'
import {
  listUserDecks,
  listUserDeckMappings,
  upsertDeckMapping,
  deleteDeckMapping,
  verifyPlanOwnership,
  resolveCanonicalTopicForMapping,
  verifyDeckExists,
  cleanupOrphanMapping,
  calculateMappingFingerprint,
  checkMappingIdempotency,
  persistMappingMutation,
  mapDeckMappingDto,
} from './flashcardMappings.js'

const USER_A = 'user-a'
const USER_B = 'user-b'
const PLAN_ID = 'plan-1'
const TOPIC_ID = 'topic-1'
const CANONICAL_ID = 'canonical-cardio'

function makeEnv(db) {
  return { DB: db }
}

async function insertCard(db, userId, overrides = {}) {
  const { id = 'card-1', deckName = 'Cardiology', state = 2, lastReview = '2026-07-01T10:00:00.000Z', nextReview = '2026-07-05T10:00:00.000Z', createdAt = '2026-07-01T00:00:00.000Z' } = overrides
  await db.prepare(
    `INSERT INTO flashcards (id, user_id, deck_name, state, last_review, next_review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, deckName, state, lastReview, nextReview, createdAt).run()
}

async function insertPlan(db, id, userId) {
  await db.prepare(
    `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, status, revision) VALUES (?, ?, 'rotation-1', 'source-1', '2026-01-01', '2026-02-01', 'cli-req-1', 'fp-1', 'active', 1)`
  ).bind(id, userId).run()
}

async function insertPlanTopic(db, id, planId, canonicalTopicId) {
  const cid = canonicalTopicId !== undefined && canonicalTopicId !== null ? canonicalTopicId : null
  await db.prepare(
    `INSERT INTO rotation_planner_topics (id, plan_id, normalized_topic_id, canonical_topic_id, topic_title, display_order) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, planId, id, cid, 'Test Topic', 0).run()
}

describe('listUserDecks', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns distinct deck names with card counts', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await insertCard(db, USER_A, { id: 'c2', deckName: 'Cardiology' })
    await insertCard(db, USER_A, { id: 'c3', deckName: 'Neurology' })
    const decks = await listUserDecks(env, USER_A)
    expect(decks).toHaveLength(2)
    expect(decks[0]).toEqual({ deckName: 'Cardiology', cardCount: 2 })
    expect(decks[1]).toEqual({ deckName: 'Neurology', cardCount: 1 })
  })

  it('excludes other users decks', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await insertCard(db, USER_B, { id: 'c2', deckName: 'Neurology' })
    const decks = await listUserDecks(env, USER_A)
    expect(decks).toHaveLength(1)
    expect(decks[0].deckName).toBe('Cardiology')
  })

  it('returns empty array when no flashcards', async () => {
    const decks = await listUserDecks(env, USER_A)
    expect(decks).toEqual([])
  })

  it('orders by deckName ASC', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Zebra' })
    await insertCard(db, USER_A, { id: 'c2', deckName: 'Alpha' })
    await insertCard(db, USER_A, { id: 'c3', deckName: 'Beta' })
    const decks = await listUserDecks(env, USER_A)
    expect(decks[0].deckName).toBe('Alpha')
    expect(decks[1].deckName).toBe('Beta')
    expect(decks[2].deckName).toBe('Zebra')
  })
})

describe('listUserDeckMappings', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns only authenticated users mappings', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Cardiology', 'canonical-cardio').run()
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m2', USER_B, 'Neurology', 'canonical-neuro').run()
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].deckName).toBe('Cardiology')
  })

  it('returns camelCase DTO fields', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Cardiology', 'canonical-cardio').run()
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings[0]).toHaveProperty('id')
    expect(mappings[0]).toHaveProperty('deckName')
    expect(mappings[0]).toHaveProperty('canonicalTopicId')
    expect(mappings[0]).toHaveProperty('createdAt')
    expect(mappings[0]).toHaveProperty('updatedAt')
    expect(mappings[0]).toHaveProperty('deckExists')
    expect(mappings[0]).toHaveProperty('cardCount')
  })

  it('orders by deckName ASC then id ASC', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m2', USER_A, 'Alpha', 'canonical-alpha').run()
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Beta', 'canonical-beta').run()
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings[0].deckName).toBe('Alpha')
    expect(mappings[1].deckName).toBe('Beta')
  })

  it('correctly reports deckExists and cardCount', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await insertCard(db, USER_A, { id: 'c2', deckName: 'Cardiology' })
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Cardiology', 'canonical-cardio').run()
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings[0].deckExists).toBe(true)
    expect(mappings[0].cardCount).toBe(2)
  })

  it('reports deckExists false for stale mapping with no cards', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'OrphanDeck', 'canonical-orphan').run()
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings[0].deckExists).toBe(false)
    expect(mappings[0].cardCount).toBe(0)
  })
})

describe('upsertDeckMapping', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('creates a new mapping', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    const mapping = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-cardio')
    expect(mapping).not.toBeNull()
    expect(mapping.deckName).toBe('Cardiology')
    expect(mapping.canonicalTopicId).toBe('canonical-cardio')
  })

  it('upsert preserves id on conflict', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    const first = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-cardio')
    const second = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-neurology')
    expect(second.id).toBe(first.id)
  })

  it('upsert preserves created_at on conflict', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    const first = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-cardio')
    const second = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-neurology')
    expect(second.createdAt).toBe(first.createdAt)
  })

  it('upsert updates canonical_topic_id on conflict', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-cardio')
    const updated = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-neurology')
    expect(updated.canonicalTopicId).toBe('canonical-neurology')
  })

  it('upsert updates updated_at on conflict', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    const first = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-cardio')
    await new Promise(r => setTimeout(r, 10))
    const second = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-neurology')
    expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime())
  })

  it('UNIQUE(user_id, deck_name) allows same deck for different users', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await insertCard(db, USER_B, { id: 'c2', deckName: 'Cardiology' })
    await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-a')
    const bMapping = await upsertDeckMapping(env, USER_B, 'Cardiology', 'canonical-b')
    expect(bMapping.canonicalTopicId).toBe('canonical-b')
  })

  it('case-sensitive deck names remain distinct', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await insertCard(db, USER_A, { id: 'c2', deckName: 'cardiology' })
    const m1 = await upsertDeckMapping(env, USER_A, 'Cardiology', 'canonical-a')
    const m2 = await upsertDeckMapping(env, USER_A, 'cardiology', 'canonical-b')
    expect(m1.deckName).toBe('Cardiology')
    expect(m2.deckName).toBe('cardiology')
  })
})

describe('deleteDeckMapping', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('deletes owned mapping', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Cardiology', 'canonical-cardio').run()
    const deleted = await deleteDeckMapping(env, 'm1', USER_A)
    expect(deleted).toBe(true)
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings).toHaveLength(0)
  })

  it('cannot delete another users mapping', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_B, 'Cardiology', 'canonical-cardio').run()
    const deleted = await deleteDeckMapping(env, 'm1', USER_A)
    expect(deleted).toBe(false)
  })

  it('returns false for missing mapping', async () => {
    const deleted = await deleteDeckMapping(env, 'nonexistent', USER_A)
    expect(deleted).toBe(false)
  })
})

describe('verifyPlanOwnership', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns true when plan belongs to user', async () => {
    await insertPlan(db, PLAN_ID, USER_A)
    expect(await verifyPlanOwnership(env, PLAN_ID, USER_A)).toBe(true)
  })

  it('returns false when plan belongs to another user', async () => {
    await insertPlan(db, PLAN_ID, USER_B)
    expect(await verifyPlanOwnership(env, PLAN_ID, USER_A)).toBe(false)
  })

  it('returns false when plan does not exist', async () => {
    expect(await verifyPlanOwnership(env, 'nonexistent', USER_A)).toBe(false)
  })
})

describe('resolveCanonicalTopicForMapping', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('resolves canonicalTopicId from plan topic', async () => {
    await insertPlan(db, PLAN_ID, USER_A)
    await insertPlanTopic(db, TOPIC_ID, PLAN_ID, CANONICAL_ID)
    const result = await resolveCanonicalTopicForMapping(env, PLAN_ID, TOPIC_ID)
    expect(result).toBe(CANONICAL_ID)
  })

  it('returns null when planTopicId not found', async () => {
    await insertPlan(db, PLAN_ID, USER_A)
    const result = await resolveCanonicalTopicForMapping(env, PLAN_ID, 'nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when planTopicId belongs to different plan', async () => {
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, status, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('plan-a', USER_A, 'rotation-1', 'source-1', '2026-01-01', '2026-02-01', 'cli-req-a', 'fp-a', 'active', 1).run()
    await db.prepare(
      `INSERT INTO rotation_planner_plans (id, user_id, rotation_id, source_id, start_date, end_date, client_request_id, request_fingerprint, status, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('plan-b', USER_A, 'rotation-1', 'source-1', '2026-01-01', '2026-02-01', 'cli-req-b', 'fp-b', 'draft', 1).run()
    await insertPlanTopic(db, TOPIC_ID, 'plan-a', CANONICAL_ID)
    const result = await resolveCanonicalTopicForMapping(env, 'plan-b', TOPIC_ID)
    expect(result).toBeNull()
  })

})


describe('verifyDeckExists', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('returns true when deck has cards', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    expect(await verifyDeckExists(env, USER_A, 'Cardiology')).toBe(true)
  })

  it('returns false when deck has no cards', async () => {
    expect(await verifyDeckExists(env, USER_A, 'Nonexistent')).toBe(false)
  })

  it('returns false for another users deck', async () => {
    await insertCard(db, USER_B, { id: 'c1', deckName: 'Cardiology' })
    expect(await verifyDeckExists(env, USER_A, 'Cardiology')).toBe(false)
  })

  it('returns true when deck exists only in deck_settings (empty deck)', async () => {
    await db.prepare(
      `INSERT INTO deck_settings (user_id, deck_name, settings) VALUES (?, ?, '{}')`
    ).bind(USER_A, 'Empty Cardiology').run()
    expect(await verifyDeckExists(env, USER_A, 'Empty Cardiology')).toBe(true)
  })

  it('returns true when deck exists in both flashcards and deck_settings', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await db.prepare(
      `INSERT INTO deck_settings (user_id, deck_name, settings) VALUES (?, ?, '{}')`
    ).bind(USER_A, 'Cardiology').run()
    expect(await verifyDeckExists(env, USER_A, 'Cardiology')).toBe(true)
  })

  it('returns false for another users deck_settings-only deck', async () => {
    await db.prepare(
      `INSERT INTO deck_settings (user_id, deck_name, settings) VALUES (?, ?, '{}')`
    ).bind(USER_B, 'B Only').run()
    expect(await verifyDeckExists(env, USER_A, 'B Only')).toBe(false)
  })

  it('matches exact deck names (does not trim or lower internal characters)', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology Step 2' })
    expect(await verifyDeckExists(env, USER_A, 'Cardiology Step 2')).toBe(true)
    expect(await verifyDeckExists(env, USER_A, 'Cardiology  Step 2')).toBe(false)
  })
})

describe('cleanupOrphanMapping', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('deletes mapping when deck has no cards', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Orphan', 'canonical-orphan').run()
    const cleaned = await cleanupOrphanMapping(env, USER_A, 'Orphan')
    expect(cleaned).toBe(true)
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings).toHaveLength(0)
  })

  it('preserves mapping when deck still has cards', async () => {
    await insertCard(db, USER_A, { id: 'c1', deckName: 'Cardiology' })
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_A, 'Cardiology', 'canonical-cardio').run()
    const cleaned = await cleanupOrphanMapping(env, USER_A, 'Cardiology')
    expect(cleaned).toBe(false)
    const mappings = await listUserDeckMappings(env, USER_A)
    expect(mappings).toHaveLength(1)
  })

  it('does not remove another users mapping', async () => {
    await db.prepare(
      `INSERT INTO flashcard_deck_mappings (id, user_id, deck_name, canonical_topic_id) VALUES (?, ?, ?, ?)`
    ).bind('m1', USER_B, 'Cardiology', 'canonical-cardio').run()
    const cleaned = await cleanupOrphanMapping(env, USER_A, 'Cardiology')
    expect(cleaned).toBe(false)
    const mappings = await listUserDeckMappings(env, USER_B)
    expect(mappings).toHaveLength(1)
  })
})

describe('idempotency', () => {
  let db, env

  beforeEach(async () => {
    db = await createTestDb()
    env = makeEnv(db)
  })

  it('sha256Hex produces consistent output', async () => {
    const h1 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Cardiology', TOPIC_ID)
    const h2 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Cardiology', TOPIC_ID)
    expect(h1).toBe(h2)
    expect(h1.length).toBe(64)
  })

  it('different input produces different fingerprint', async () => {
    const h1 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Cardiology', TOPIC_ID)
    const h2 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Neurology', TOPIC_ID)
    expect(h1).not.toBe(h2)
  })

  it('same clientRequestId + same fingerprint replays exact POST result', async () => {
    const fp = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Cardiology', TOPIC_ID)
    const result = { mapping: { id: 'm1' }, recalculationRequired: false }
    await persistMappingMutation(env, USER_A, 'same-key', fp, result)

    const check = await checkMappingIdempotency(env, USER_A, 'same-key')
    expect(check.status).toBe('found')
    expect(check.existingFingerprint).toBe(fp)
    expect(check.existingResult).toEqual(result)
  })

  it('same clientRequestId + different fingerprint returns conflict', async () => {
    const fp1 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Cardiology', TOPIC_ID)
    const result = { mapping: { id: 'm1' }, recalculationRequired: false }
    await persistMappingMutation(env, USER_A, 'same-key', fp1, result)

    const fp2 = await calculateMappingFingerprint(USER_A, PLAN_ID, 'Neurology', TOPIC_ID)
    const check = await checkMappingIdempotency(env, USER_A, 'same-key')
    expect(check.status).toBe('found')
    expect(check.existingFingerprint).not.toBe(fp2)
  })

  it('same clientRequestId + same fingerprint replays exact DELETE result', async () => {
    const fp = await calculateMappingFingerprint(USER_A, 'delete', 'mapping-1', 'delete')
    const result = { deleted: true, mappingId: 'mapping-1', recalculationRequired: false }
    await persistMappingMutation(env, USER_A, 'delete-key', fp, result)

    const check = await checkMappingIdempotency(env, USER_A, 'delete-key')
    expect(check.status).toBe('found')
    expect(check.existingFingerprint).toBe(fp)
    expect(check.existingResult).toEqual(result)
  })

  it('missing clientRequestId returns no_key', async () => {
    const check = await checkMappingIdempotency(env, USER_A, null)
    expect(check.status).toBe('no_key')
  })

  it('unknown clientRequestId returns not_found', async () => {
    const check = await checkMappingIdempotency(env, USER_A, 'unknown-key')
    expect(check.status).toBe('not_found')
  })
})

describe('mapDeckMappingDto', () => {
  it('converts snake_case row to camelCase', () => {
    const row = {
      id: 'm1',
      deck_name: 'Cardiology',
      canonical_topic_id: 'canonical-cardio',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      card_count: 5,
    }
    const dto = mapDeckMappingDto(row)
    expect(dto.id).toBe('m1')
    expect(dto.deckName).toBe('Cardiology')
    expect(dto.canonicalTopicId).toBe('canonical-cardio')
    expect(dto.createdAt).toBe('2026-07-01T00:00:00.000Z')
    expect(dto.updatedAt).toBe('2026-07-01T00:00:00.000Z')
    expect(dto.cardCount).toBe(5)
    expect(dto.deckExists).toBe(true)
  })

  it('handles zero card_count', () => {
    const dto = mapDeckMappingDto({ id: 'm1', deck_name: 'Orphan', canonical_topic_id: 'x', created_at: '', updated_at: '', card_count: 0 })
    expect(dto.cardCount).toBe(0)
    expect(dto.deckExists).toBe(false)
  })
})
