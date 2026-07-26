import { describe, it, expect } from 'vitest'
import {
  assignStudyBlocks,
  BLOCK_TARGET_MINUTES,
  BLOCK_MAX_MINUTES,
} from '../studyBlockAssignment.js'

function makeTask(overrides = {}) {
  return {
    taskDate: '2026-07-26',
    taskType: 'learning',
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.chest-pain',
    canonicalTopicId: 'cardiology.chest-pain',
    estimatedMinutes: 20,
    displayOrder: 0,
    status: 'pending',
    metadata: {},
    ...overrides,
  }
}

function makeUworldTask(overrides = {}) {
  return {
    taskDate: '2026-07-26',
    taskType: 'uworld_questions',
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.chest-pain',
    canonicalTopicId: 'cardiology.chest-pain',
    estimatedMinutes: 30,
    displayOrder: 1,
    status: 'pending',
    metadata: {},
    ...overrides,
  }
}

function makeTopicMap(entries = {}) {
  const map = new Map()
  for (const [id, info] of Object.entries(entries)) {
    map.set(id, info)
  }
  return map
}

describe('assignStudyBlocks', () => {
  it('empty input returns empty array', () => {
    const result = assignStudyBlocks([], new Map())
    expect(result).toEqual([])
  })

  it('all non-learning tasks returned without block IDs', () => {
    const tasks = [
      makeUworldTask({ displayOrder: 0 }),
      makeUworldTask({ displayOrder: 1, canonicalTopicId: 'cardiology.bp', normalizedTopicId: 'src::cardiology.bp' }),
    ]
    const result = assignStudyBlocks(tasks, new Map())
    expect(result).toHaveLength(2)
    expect(result[0].metadata.studyBlockId).toBeUndefined()
    expect(result[1].metadata.studyBlockId).toBeUndefined()
  })

  it('single learning task gets singleton block', () => {
    const tasks = [makeTask({ estimatedMinutes: 20 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result).toHaveLength(1)
    expect(result[0].metadata.studyBlockId).toBeDefined()
  })
})

describe('assignStudyBlocks — grouping rules', () => {
  it('two contiguous tasks, same source + section, combined ≤ MAX → same block', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 1 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).toBe(result[1].metadata.studyBlockId)
  })

  it('two tasks, different sections → different blocks', () => {
    const tasks = [
      makeTask({ canonicalTopicId: 'cardiology.chest-pain', normalizedTopicId: 'src1::cardiology.chest-pain', displayOrder: 0, estimatedMinutes: 20 }),
      makeTask({ canonicalTopicId: 'cardiology.bp', normalizedTopicId: 'src1::cardiology.bp', displayOrder: 1, estimatedMinutes: 20 }),
    ]
    const topicMap = makeTopicMap({
      'src1::cardiology.chest-pain': { sourceId: 'src1', groupId: 'Chest Pain' },
      'src1::cardiology.bp': { sourceId: 'src1', groupId: 'Hypertension' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).not.toBe(result[1].metadata.studyBlockId)
  })

  it('two tasks, different sources → different blocks', () => {
    const tasks = [
      makeTask({ canonicalTopicId: 'cardiology.chest-pain', normalizedTopicId: 'src-a::cardiology.chest-pain', displayOrder: 0, estimatedMinutes: 20 }),
      makeTask({ canonicalTopicId: 'surgery.appendicitis', normalizedTopicId: 'src-b::surgery.appendicitis', displayOrder: 1, estimatedMinutes: 20 }),
    ]
    const topicMap = makeTopicMap({
      'src-a::cardiology.chest-pain': { sourceId: 'src-a', groupId: 'Chest Pain' },
      'src-b::surgery.appendicitis': { sourceId: 'src-b', groupId: 'Appendicitis' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).not.toBe(result[1].metadata.studyBlockId)
  })

  it('two tasks, combined > MAX → different blocks', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 30, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 30, displayOrder: 1 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).not.toBe(result[1].metadata.studyBlockId)
  })

  it('exactly at MAX combined → stays in same block', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 25, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 1 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).toBe(result[1].metadata.studyBlockId)
  })
})

describe('assignStudyBlocks — contiguity break', () => {
  it('learning, uworld, learning same section → two separate blocks', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeUworldTask({ displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const learningTasks = result.filter(t => t.taskType === 'learning')
    expect(learningTasks[0].metadata.studyBlockId).not.toBe(learningTasks[1].metadata.studyBlockId)
  })

  it('uworld between two learning tasks does not get a block ID', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeUworldTask({ displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const uworld = result.find(t => t.taskType === 'uworld_questions')
    expect(uworld.metadata.studyBlockId).toBeUndefined()
  })
})

describe('assignStudyBlocks — missing metadata', () => {
  it('missing-metadata task gets no block ID', () => {
    const tasks = [makeTask({ estimatedMinutes: 20, normalizedTopicId: null })]
    const result = assignStudyBlocks(tasks, new Map())
    expect(result[0].metadata.studyBlockId).toBeUndefined()
  })

  it('two missing-metadata topics never group', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-b', displayOrder: 1 }),
    ]
    const result = assignStudyBlocks(tasks, new Map())
    expect(result[0].metadata.studyBlockId).toBeUndefined()
    expect(result[1].metadata.studyBlockId).toBeUndefined()
  })

  it('missing metadata breaks adjacency', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 5, normalizedTopicId: 'src::topic-missing', displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'src::topic-a': { sourceId: 'src', groupId: 'SectionA' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const withBlocks = result.filter(t => t.metadata.studyBlockId)
    const missing = result.find(t => !t.metadata.studyBlockId && t.taskType === 'learning')
    expect(missing).toBeDefined()
    expect(withBlocks).toHaveLength(2)
    expect(withBlocks[0].metadata.studyBlockId).not.toBe(withBlocks[1].metadata.studyBlockId)
  })

  it('surrounding compatible topics do not group across missing-metadata task', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 5, normalizedTopicId: 'src::topic-missing', displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'src::topic-a': { sourceId: 'src', groupId: 'SectionA' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blockIds = result
      .filter(t => t.metadata.studyBlockId)
      .map(t => t.metadata.studyBlockId)
    const unique = new Set(blockIds)
    expect(unique.size).toBe(2)
  })
})

describe('assignStudyBlocks — date separation', () => {
  it('tasks on different dates get different blocks', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0, taskDate: '2026-07-26' }),
      makeTask({ estimatedMinutes: 20, displayOrder: 0, taskDate: '2026-07-27' }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).not.toBe(result[1].metadata.studyBlockId)
    expect(result[0].metadata.studyBlockId).toContain('2026-07-26')
    expect(result[1].metadata.studyBlockId).toContain('2026-07-27')
  })
})

describe('assignStudyBlocks — ordinal', () => {
  it('ordinal resets per date', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 30, displayOrder: 0, taskDate: '2026-07-26' }),
      makeTask({ estimatedMinutes: 30, displayOrder: 0, taskDate: '2026-07-27' }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).toContain('::0')
    expect(result[1].metadata.studyBlockId).toContain('::0')
  })

  it('multiple blocks on same day get incrementing ordinals', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 30, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 30, displayOrder: 1 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.studyBlockId).toContain('::0')
    expect(result[1].metadata.studyBlockId).toContain('::1')
    expect(result[0].metadata.studyBlockId).not.toBe(result[1].metadata.studyBlockId)
  })
})

describe('assignStudyBlocks — partition quality', () => {
  function partition(input) {
    const tasks = input.map((m, i) => makeTask({ estimatedMinutes: m, displayOrder: i }))
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    return blocks.map(b => b.minutes)
  }

  it('3+4+9+17 => 33', () => {
    expect(partition([3, 4, 9, 17])).toEqual([33])
  })

  it('20+20+5 => 45', () => {
    expect(partition([20, 20, 5])).toEqual([45])
  })

  it('25+20+5 => 25 | 25', () => {
    expect(partition([25, 20, 5])).toEqual([25, 25])
  })

  it('30+15+5 => 30 | 20', () => {
    expect(partition([30, 15, 5])).toEqual([30, 20])
  })

  it('30+30 => 30 | 30', () => {
    expect(partition([30, 30])).toEqual([30, 30])
  })

  it('20+20+10 => optimal deterministic partition', () => {
    expect(partition([20, 20, 10])).toEqual([20, 30])
  })

  it('single 55 => 55', () => {
    expect(partition([55])).toEqual([55])
  })

  it('exact 45 boundary', () => {
    expect(partition([45])).toEqual([45])
  })

  it('missing metadata breaks run', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 5, normalizedTopicId: 'src::topic-missing', displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::topic-a', displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'src::topic-a': { sourceId: 'src', groupId: 'SectionA' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      if (!t.metadata.studyBlockId) continue
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    expect(blocks.map(b => b.minutes)).toEqual([20, 20])
  })

  it('different source breaks run', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src-a::topic', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 5, normalizedTopicId: 'src-b::topic', displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src-a::topic', displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'src-a::topic': { sourceId: 'src-a', groupId: 'Sec' },
      'src-b::topic': { sourceId: 'src-b', groupId: 'Sec' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    expect(blocks.map(b => b.minutes)).toEqual([20, 5, 20])
  })

  it('different section breaks run', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::t1', displayOrder: 0 }),
      makeTask({ estimatedMinutes: 5, normalizedTopicId: 'src::t2', displayOrder: 1 }),
      makeTask({ estimatedMinutes: 20, normalizedTopicId: 'src::t1', displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'src::t1': { sourceId: 'src', groupId: 'SecA' },
      'src::t2': { sourceId: 'src', groupId: 'SecB' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    expect(blocks.map(b => b.minutes)).toEqual([20, 5, 20])
  })

  it('non-learning task breaks run', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeUworldTask({ displayOrder: 1, estimatedMinutes: 5 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      if (!t.metadata.studyBlockId) continue
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    expect(blocks.map(b => b.minutes)).toEqual([20, 20])
  })

  it('different date breaks run', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0, taskDate: '2026-07-26' }),
      makeTask({ estimatedMinutes: 20, displayOrder: 0, taskDate: '2026-07-27' }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blocks = []
    for (const t of result) {
      const last = blocks[blocks.length - 1]
      if (last && last.id === t.metadata.studyBlockId) {
        last.minutes += t.estimatedMinutes
      } else {
        blocks.push({ id: t.metadata.studyBlockId, minutes: t.estimatedMinutes })
      }
    }
    expect(blocks.map(b => b.minutes)).toEqual([20, 20])
  })
})

describe('assignStudyBlocks — workload conservation', () => {
  it('total estimated minutes preserved across all tasks', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 25, displayOrder: 1 }),
      makeTask({ estimatedMinutes: 15, displayOrder: 2 }),
      makeTask({ estimatedMinutes: 30, displayOrder: 3 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const inputTotal = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
    const outputTotal = result.reduce((sum, t) => sum + t.estimatedMinutes, 0)
    expect(outputTotal).toBe(inputTotal)
    expect(outputTotal).toBe(90)
  })
})

describe('assignStudyBlocks — determinism', () => {
  it('same input produces same output', () => {
    const tasks = [
      makeTask({ estimatedMinutes: 20, displayOrder: 0 }),
      makeTask({ estimatedMinutes: 20, displayOrder: 1 }),
      makeTask({ estimatedMinutes: 5, displayOrder: 2 }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result1 = assignStudyBlocks(tasks, topicMap)
    const result2 = assignStudyBlocks(tasks, topicMap)
    expect(result1.map(t => t.metadata.studyBlockId)).toEqual(result2.map(t => t.metadata.studyBlockId))
  })
})

describe('assignStudyBlocks — input immutability', () => {
  it('original task objects are not mutated', () => {
    const task = makeTask({ estimatedMinutes: 20 })
    const original = { ...task, metadata: { ...task.metadata } }
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    assignStudyBlocks([task], topicMap)
    expect(task).toEqual(original)
  })
})

describe('assignStudyBlocks — block ID format and collision safety', () => {
  it('block ID has correct structure', () => {
    const tasks = [makeTask({ estimatedMinutes: 20, displayOrder: 0 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'Step-Up Medicine 6e', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blockId = result[0].metadata.studyBlockId
    const parts = blockId.split('::')
    expect(parts).toHaveLength(5)
    expect(parts[0]).toBe('sb')
    expect(parts[1]).toBe('2026-07-26')
    expect(parts[4]).toBe('0')
  })

  it('"GI / Liver" and "GI Liver" produce different block IDs', () => {
    const tasksA = [makeTask({ estimatedMinutes: 20, displayOrder: 0, normalizedTopicId: 'src::t', canonicalTopicId: 't' })]
    const tasksB = [makeTask({ estimatedMinutes: 20, displayOrder: 0, normalizedTopicId: 'src::t', canonicalTopicId: 't' })]
    const topicMapA = makeTopicMap({ 'src::t': { sourceId: 'GI / Liver', groupId: 'Sec' } })
    const topicMapB = makeTopicMap({ 'src::t': { sourceId: 'GI Liver', groupId: 'Sec' } })
    const idA = assignStudyBlocks(tasksA, topicMapA)[0].metadata.studyBlockId
    const idB = assignStudyBlocks(tasksB, topicMapB)[0].metadata.studyBlockId
    expect(idA).not.toBe(idB)
  })

  it('raw colon in source is encoded safely', () => {
    const tasks = [makeTask({ estimatedMinutes: 20, displayOrder: 0 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'Source:A', groupId: 'Section' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blockId = result[0].metadata.studyBlockId
    expect(blockId.split('::')).toHaveLength(5)
    expect(blockId).toContain('Source%cA')
  })

  it('percent in source is encoded safely', () => {
    const tasks = [makeTask({ estimatedMinutes: 20, displayOrder: 0 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: '100%', groupId: 'Sec' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    const blockId = result[0].metadata.studyBlockId
    expect(blockId).toContain('100%%')
    expect(blockId.split('::')).toHaveLength(5)
  })
})

describe('assignStudyBlocks — sorting', () => {
  it('output is sorted by date then displayOrder', () => {
    const tasks = [
      makeTask({ displayOrder: 2, taskDate: '2026-07-27' }),
      makeTask({ displayOrder: 0, taskDate: '2026-07-26' }),
      makeTask({ displayOrder: 1, taskDate: '2026-07-26' }),
    ]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].taskDate).toBe('2026-07-26')
    expect(result[0].displayOrder).toBe(0)
    expect(result[1].taskDate).toBe('2026-07-26')
    expect(result[1].displayOrder).toBe(1)
    expect(result[2].taskDate).toBe('2026-07-27')
    expect(result[2].displayOrder).toBe(2)
  })
})

describe('assignStudyBlocks — edge cases', () => {
  it('single 1-minute task gets singleton block', () => {
    const tasks = [makeTask({ estimatedMinutes: 1, displayOrder: 0 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result).toHaveLength(1)
    expect(result[0].metadata.studyBlockId).toBeDefined()
  })

  it('task exceeding MAX alone still gets a block', () => {
    const tasks = [makeTask({ estimatedMinutes: 50, displayOrder: 0 })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result).toHaveLength(1)
    expect(result[0].metadata.studyBlockId).toBeDefined()
  })

  it('metadata is spread, not replaced', () => {
    const tasks = [makeTask({ estimatedMinutes: 20, displayOrder: 0, metadata: { existing: true } })]
    const topicMap = makeTopicMap({
      'step-up-medicine-6e-2024::cardiology.chest-pain': { sourceId: 'step-up-medicine-6e-2024', groupId: 'Chest Pain' },
    })
    const result = assignStudyBlocks(tasks, topicMap)
    expect(result[0].metadata.existing).toBe(true)
    expect(result[0].metadata.studyBlockId).toBeDefined()
  })
})
