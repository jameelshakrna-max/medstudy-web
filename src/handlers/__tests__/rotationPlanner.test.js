import { describe, it, expect } from 'vitest'
import {
  getPlannerRotations,
  getPlannerSources,
  getPlannerSourceRotations,
  getPlannerSourceRotationTopics,
} from '../rotationPlanner.js'

const mockUser = { sub: 'user-test', email: 'test@test.local', role: 'authenticated' }

function makeRequest(path) {
  return new Request(`https://medstudy.app${path}`)
}

async function callHandler(handler, path) {
  const res = await handler(makeRequest(path), {}, mockUser)
  return { status: res.status, body: await res.json() }
}

// ──────────────────────────────────────────────────────────
// GET /api/rotation-planner/rotations
// ──────────────────────────────────────────────────────────
describe('getPlannerRotations', () => {
  it('returns 200 with an array of canonical rotations', async () => {
    const { status, body } = await callHandler(getPlannerRotations, '/api/rotation-planner/rotations')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('each rotation has id, displayLabel, subjectId', async () => {
    const { body } = await callHandler(getPlannerRotations, '/api/rotation-planner/rotations')
    for (const r of body) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.displayLabel).toBe('string')
      expect('subjectId' in r).toBe(true)
    }
  })

  it('includes cardiology', async () => {
    const { body } = await callHandler(getPlannerRotations, '/api/rotation-planner/rotations')
    const ids = body.map((r) => r.id)
    expect(ids).toContain('cardiology')
  })

  it('does not expose internal fields like _raw', async () => {
    const { body } = await callHandler(getPlannerRotations, '/api/rotation-planner/rotations')
    for (const r of body) {
      expect(r).not.toHaveProperty('_raw')
      expect(r).not.toHaveProperty('sourceFileId')
    }
  })
})

// ──────────────────────────────────────────────────────────
// GET /api/rotation-planner/sources
// ──────────────────────────────────────────────────────────
describe('getPlannerSources', () => {
  it('returns 200 with an array of sources', async () => {
    const { status, body } = await callHandler(getPlannerSources, '/api/rotation-planner/sources')
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('each source has required fields', async () => {
    const { body } = await callHandler(getPlannerSources, '/api/rotation-planner/sources')
    for (const s of body) {
      expect(typeof s.id).toBe('string')
      expect(typeof s.title).toBe('string')
      expect(typeof s.edition === 'string' || s.edition === null).toBe(true)
      expect(typeof s.year === 'number' || s.year === null).toBe(true)
      expect(typeof s.version === 'string' || s.version === null).toBe(true)
      expect(typeof s.type).toBe('string')
      expect(typeof s.questionSource).toBe('string')
      expect(Array.isArray(s.supportedRotations)).toBe(true)
      expect(typeof s.topicCount).toBe('number')
    }
  })

  it('topicCount uses normalized counts, not raw', async () => {
    const { body } = await callHandler(getPlannerSources, '/api/rotation-planner/sources')
    const stepUp = body.find((s) => s.id === 'step-up-medicine-6e-2024')
    expect(stepUp).toBeDefined()
    expect(stepUp.topicCount).toBe(443)
  })

  it('does not expose metadata or raw fields', async () => {
    const { body } = await callHandler(getPlannerSources, '/api/rotation-planner/sources')
    for (const s of body) {
      expect(s).not.toHaveProperty('metadata')
      expect(s).not.toHaveProperty('rawEntryCount')
    }
  })
})

// ──────────────────────────────────────────────────────────
// GET /api/rotation-planner/sources/:sourceId/rotations
// ──────────────────────────────────────────────────────────
describe('getPlannerSourceRotations', () => {
  it('returns 200 with canonical rotations for a valid source', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotations,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations'
    )
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('each rotation has id, displayLabel, subjectId, topicCount', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotations,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations'
    )
    for (const r of body) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.displayLabel).toBe('string')
      expect('subjectId' in r).toBe(true)
      expect(typeof r.topicCount).toBe('number')
      expect(r.topicCount).toBeGreaterThan(0)
    }
  })

  it('all rotation IDs are canonical', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotations,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations'
    )
    const canonicalIds = [
      'cardiology', 'pulmonology', 'gastroenterology', 'endocrinology',
      'neurology', 'nephrology', 'rheumatology', 'hematology-oncology',
      'infectious-disease', 'dermatology-hypersensitivity', 'ambulatory-medicine',
      'emergency-medicine', 'fluids-electrolytes-acid-base',
    ]
    for (const r of body) {
      expect(canonicalIds).toContain(r.id)
    }
  })

  it('returns 404 SOURCE_NOT_FOUND for unknown source', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotations,
      '/api/rotation-planner/sources/nonexistent-source/rotations'
    )
    expect(status).toBe(404)
    expect(body.error.code).toBe('SOURCE_NOT_FOUND')
  })

  it('does not expose source-specific labels or word counts', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotations,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations'
    )
    for (const r of body) {
      expect(r).not.toHaveProperty('words')
      expect(r).not.toHaveProperty('rotation')
      expect(r).not.toHaveProperty('wordCount')
    }
  })
})

// ──────────────────────────────────────────────────────────
// GET /api/rotation-planner/sources/:sourceId/rotations/:rotationId/topics
// ──────────────────────────────────────────────────────────
describe('getPlannerSourceRotationTopics', () => {
  it('returns 200 with topics for a valid source+rotation', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('each topic has the required DTO fields', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    for (const t of body) {
      expect(typeof t.normalizedTopicId).toBe('string')
      expect(typeof t.canonicalTopicId).toBe('string')
      expect(typeof t.sourceTopicId).toBe('string')
      expect(typeof t.title).toBe('string')
      expect(typeof t.groupId).toBe('string')
      expect(typeof t.confidence).toBe('string')
      expect(typeof t.questionSource).toBe('string')
      expect(typeof t.studyUnitType).toBe('string')
      expect(t.learningMinutes).toBeDefined()
      expect(typeof t.learningMinutes.focused).toBe('number')
      expect(typeof t.learningMinutes.activeLow).toBe('number')
      expect(typeof t.learningMinutes.activeExpected).toBe('number')
      expect(typeof t.learningMinutes.activeHigh).toBe('number')
      expect(typeof t.learningMinutes.detailedNotes).toBe('number')
    }
  })

  it('normalizedTopicId is present and source-scoped', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    for (const t of body) {
      expect(t.normalizedTopicId).toMatch(/^step-up-medicine-6e-2024::/)
    }
  })

  it('does not expose metadata', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    for (const t of body) {
      expect(t).not.toHaveProperty('metadata')
      expect(t).not.toHaveProperty('sourceId')
      expect(t).not.toHaveProperty('sourceTitle')
      expect(t).not.toHaveProperty('rotationId')
    }
  })

  it('preserves normalized catalog order', async () => {
    const { body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    const firstIds = body.slice(0, 5).map((t) => t.normalizedTopicId)
    const secondCall = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/cardiology/topics'
    )
    const secondIds = secondCall.body.slice(0, 5).map((t) => t.normalizedTopicId)
    expect(firstIds).toEqual(secondIds)
  })

  it('returns 404 SOURCE_NOT_FOUND for unknown source', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/nonexistent/rotations/cardiology/topics'
    )
    expect(status).toBe(404)
    expect(body.error.code).toBe('SOURCE_NOT_FOUND')
  })

  it('returns 404 ROTATION_NOT_FOUND for unknown canonical rotation', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/nonexistent-rotation/topics'
    )
    expect(status).toBe(404)
    expect(body.error.code).toBe('ROTATION_NOT_FOUND')
  })

  it('returns 404 ROTATION_NOT_SUPPORTED_BY_SOURCE for valid but unsupported rotation', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/step-up-medicine-6e-2024/rotations/ophthalmology/topics'
    )
    expect(status).toBe(404)
    expect(body.error.code).toBe('ROTATION_NOT_SUPPORTED_BY_SOURCE')
  })

  it('works with a different source (essentials)', async () => {
    const { status, body } = await callHandler(
      getPlannerSourceRotationTopics,
      '/api/rotation-planner/sources/el-husseiny-essentials-step2ck/rotations/cardiology/topics'
    )
    expect(status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })
})
