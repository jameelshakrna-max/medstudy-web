import { PLANNER_TABLES } from '../db/rotationPlannerSchema.js'
import { getFlashcardCapacityOwner } from './rotationPlannerPlans/ownership.js'

const T = PLANNER_TABLES

export async function listUserDecks(env, userId) {
  const { results } = await env.DB.prepare(
    'SELECT deck_name, COUNT(*) as card_count FROM flashcards WHERE user_id = ? GROUP BY deck_name ORDER BY deck_name'
  ).bind(userId).all()
  return results.map(r => ({ deckName: r.deck_name, cardCount: r.card_count }))
}

export async function listUserDeckMappings(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.deck_name, m.canonical_topic_id, m.created_at, m.updated_at,
            COUNT(f.id) as card_count
     FROM ${T.flashcardDeckMappings} m
     LEFT JOIN flashcards f ON f.user_id = m.user_id AND f.deck_name = m.deck_name
     WHERE m.user_id = ?
     GROUP BY m.id
     ORDER BY m.deck_name ASC, m.id ASC`
  ).bind(userId).all()
  return results.map(mapDeckMappingDto)
}

export async function upsertDeckMapping(env, userId, deckName, canonicalTopicId) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO ${T.flashcardDeckMappings} (id, user_id, deck_name, canonical_topic_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, deck_name) DO UPDATE SET
       canonical_topic_id = excluded.canonical_topic_id,
       updated_at = excluded.updated_at`
  ).bind(id, userId, deckName, canonicalTopicId, now, now).run()

  await signalFlashcardMappingsStaleness(env, userId).catch(() => {})

  const row = await env.DB.prepare(
    `SELECT m.id, m.deck_name, m.canonical_topic_id, m.created_at, m.updated_at,
            COUNT(f.id) as card_count
     FROM ${T.flashcardDeckMappings} m
     LEFT JOIN flashcards f ON f.user_id = m.user_id AND f.deck_name = m.deck_name
     WHERE m.user_id = ? AND m.deck_name = ?
     GROUP BY m.id`
  ).bind(userId, deckName).first()

  return row ? mapDeckMappingDto(row) : null
}

export async function deleteDeckMapping(env, mappingId, userId) {
  const { meta } = await env.DB.prepare(
    `DELETE FROM ${T.flashcardDeckMappings} WHERE id = ? AND user_id = ?`
  ).bind(mappingId, userId).run()
  await signalFlashcardMappingsStaleness(env, userId).catch(() => {})
  return meta.changes > 0
}

export async function verifyPlanOwnership(env, planId, userId) {
  const row = await env.DB.prepare(
    'SELECT id FROM rotation_planner_plans WHERE id = ? AND user_id = ?'
  ).bind(planId, userId).first()
  return !!row
}

export async function resolveCanonicalTopicForMapping(env, planId, planTopicId) {
  const row = await env.DB.prepare(
    `SELECT canonical_topic_id FROM rotation_planner_topics WHERE id = ? AND plan_id = ?`
  ).bind(planTopicId, planId).first()
  if (!row) return null
  return row.canonical_topic_id || null
}

export async function verifyDeckExists(env, userId, deckName) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM flashcards WHERE user_id = ? AND deck_name = ?'
  ).bind(userId, deckName).first()
  return row && row.count > 0
}

export async function cleanupOrphanMapping(env, userId, deckName) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM flashcards WHERE user_id = ? AND deck_name = ?'
  ).bind(userId, deckName).first()
  if (row && row.count === 0) {
    const { meta } = await env.DB.prepare(
      `DELETE FROM ${T.flashcardDeckMappings} WHERE user_id = ? AND deck_name = ?`
    ).bind(userId, deckName).run()
    return meta.changes > 0
  }
  return false
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function calculateMappingFingerprint(userId, planId, deckName, planTopicId) {
  const canonical = JSON.stringify({ userId, planId, deckName, planTopicId }, null, 0)
  return sha256Hex(canonical)
}

const MUTATION_TABLE = 'flashcard_deck_mapping_mutations'

export async function checkMappingIdempotency(env, userId, clientRequestId) {
  if (!clientRequestId) return { status: 'no_key' }
  const row = await env.DB.prepare(
    `SELECT request_fingerprint, result_json FROM ${MUTATION_TABLE} WHERE user_id = ? AND client_request_id = ?`
  ).bind(userId, clientRequestId).first()
  if (!row) return { status: 'not_found' }
  return {
    status: 'found',
    existingFingerprint: row.request_fingerprint,
    existingResult: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
  }
}

export async function persistMappingMutation(env, userId, clientRequestId, fingerprint, resultJson) {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO ${MUTATION_TABLE} (id, user_id, client_request_id, request_fingerprint, result_json) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, userId, clientRequestId, fingerprint, JSON.stringify(resultJson)).run()
}

export async function signalFlashcardMappingsStaleness(env, userId) {
  try {
    const owner = await getFlashcardCapacityOwner(env, userId)
    if (!owner) return
    await env.DB.prepare(
      `UPDATE ${T.plans}
       SET stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND user_id = ?`
    ).bind(owner.id, userId).run()
  } catch (_) {
    // Best-effort
  }
}

export function mapDeckMappingDto(row) {
  const cardCount = row.card_count || 0
  return {
    id: row.id,
    deckName: row.deck_name,
    canonicalTopicId: row.canonical_topic_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deckExists: cardCount > 0,
    cardCount,
  }
}
