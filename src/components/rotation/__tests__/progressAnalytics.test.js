import { describe, it, expect } from 'vitest'
import {
  calculateOverallTopicProgress,
  calculateLearningProgress,
  calculateUworldProgress,
  calculateIncorrectReviewProgress,
  buildScheduledVsLoggedSeries,
  summarizeTopicStatuses,
  findDelayedTopics,
  findTopicsNeedingAttention,
  summarizeConfidence,
} from '../progressAnalytics'

const makeTopic = (overrides) => ({
  id: 't1',
  topicTitle: 'Cardiology',
  groupId: 'g1',
  status: 'pending',
  personalizedLearningMinutes: 600,
  totalUworldQuestions: 40,
  completedUworldQuestions: 10,
  incorrectQuestionsRemaining: 5,
  estimateConfidence: 'high',
  ...overrides,
})

const makeTask = (overrides) => ({
  id: 'task1',
  planTopicId: 't1',
  taskType: 'learning',
  taskDate: '2026-07-15',
  status: 'pending',
  estimatedMinutes: 30,
  actualMinutes: null,
  completionPercentage: 0,
  incorrectCount: 0,
  completedCount: 0,
  ...overrides,
})

describe('calculateOverallTopicProgress', () => {
  it('returns zeros for empty array', () => {
    const result = calculateOverallTopicProgress([])
    expect(result).toEqual({ total: 0, completed: 0, percent: 0 })
  })

  it('counts all topics as total', () => {
    const topics = [
      makeTopic({ status: 'pending' }),
      makeTopic({ id: 't2', status: 'pending' }),
      makeTopic({ id: 't3', status: 'completed' }),
    ]
    expect(calculateOverallTopicProgress(topics).total).toBe(3)
  })

  it('counts only completed topics', () => {
    const topics = [
      makeTopic({ status: 'completed' }),
      makeTopic({ id: 't2', status: 'completed' }),
      makeTopic({ id: 't3', status: 'learning' }),
    ]
    expect(calculateOverallTopicProgress(topics).completed).toBe(2)
  })

  it('returns 100% when all topics are completed', () => {
    const topics = [
      makeTopic({ status: 'completed' }),
      makeTopic({ id: 't2', status: 'completed' }),
    ]
    expect(calculateOverallTopicProgress(topics).percent).toBe(100)
  })

  it('returns 0% when no topics are completed', () => {
    const topics = [
      makeTopic({ status: 'pending' }),
      makeTopic({ id: 't2', status: 'learning' }),
    ]
    expect(calculateOverallTopicProgress(topics).percent).toBe(0)
  })

  it('rounds percent correctly', () => {
    const topics = Array.from({ length: 3 }, (_, i) =>
      makeTopic({ id: 't' + i, status: i < 1 ? 'completed' : 'pending' })
    )
    expect(calculateOverallTopicProgress(topics).percent).toBe(33)
  })

  it('handles single topic', () => {
    expect(calculateOverallTopicProgress([makeTopic({ status: 'completed' })])).toEqual({
      total: 1,
      completed: 1,
      percent: 100,
    })
  })
})

describe('calculateLearningProgress', () => {
  it('returns zeros for empty inputs', () => {
    const result = calculateLearningProgress([], [])
    expect(result).toEqual({ total: 0, completed: 0, percent: 0, topics: [] })
  })

  it('returns 0% when total baseline is zero', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 0 })]
    const result = calculateLearningProgress(topics, [])
    expect(result.percent).toBe(0)
    expect(result.total).toBe(0)
  })

  it('treats completed tasks as full fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 60 })]
    const tasks = [makeTask({ status: 'completed', estimatedMinutes: 30 })]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.completed).toBe(30)
    expect(result.percent).toBe(50)
  })

  it('treats partial tasks using completionPercentage', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'partial', estimatedMinutes: 60, completionPercentage: 50 })]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.completed).toBe(30)
    expect(result.percent).toBe(30)
  })

  it('treats in_progress tasks using completionPercentage', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'in_progress', estimatedMinutes: 40, completionPercentage: 25 })]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.completed).toBe(10)
  })

  it('treats pending tasks as zero fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'pending', estimatedMinutes: 60 })]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('treats locked tasks as zero fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'locked', estimatedMinutes: 60 })]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('treats skipped tasks as zero fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'skipped', estimatedMinutes: 60 })]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('treats unknown status tasks as zero fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'bogus', estimatedMinutes: 60 })]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('treats in_progress with null completionPercentage as zero fraction', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 100 })]
    const tasks = [makeTask({ status: 'in_progress', estimatedMinutes: 60, completionPercentage: null })]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('caps completed minutes at baseline', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 30 })]
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 30 }),
      makeTask({ id: 'task2', status: 'completed', estimatedMinutes: 30 }),
    ]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.completed).toBe(30)
    expect(result.percent).toBe(100)
  })

  it('returns per-topic breakdown', () => {
    const topics = [
      makeTopic({ id: 't1', topicTitle: 'Cardiology', personalizedLearningMinutes: 100 }),
      makeTopic({ id: 't2', topicTitle: 'Neurology', personalizedLearningMinutes: 200 }),
    ]
    const tasks = [
      makeTask({ planTopicId: 't1', status: 'completed', estimatedMinutes: 50 }),
      makeTask({ id: 'task2', planTopicId: 't2', status: 'completed', estimatedMinutes: 100 }),
    ]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.topics).toHaveLength(2)
    expect(result.topics[0]).toEqual({
      topicId: 't1',
      topicTitle: 'Cardiology',
      baseline: 100,
      completed: 50,
      percent: 50,
    })
    expect(result.topics[1]).toEqual({
      topicId: 't2',
      topicTitle: 'Neurology',
      baseline: 200,
      completed: 100,
      percent: 50,
    })
  })

  it('aggregates percent across multiple topics', () => {
    const topics = [
      makeTopic({ id: 't1', personalizedLearningMinutes: 100 }),
      makeTopic({ id: 't2', personalizedLearningMinutes: 100 }),
    ]
    const tasks = [
      makeTask({ planTopicId: 't1', status: 'completed', estimatedMinutes: 100 }),
    ]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.total).toBe(200)
    expect(result.completed).toBe(100)
    expect(result.percent).toBe(50)
  })

  it('ignores tasks that do not match topic or taskType', () => {
    const topics = [makeTopic({ id: 't1', personalizedLearningMinutes: 100 })]
    const tasks = [
      makeTask({ planTopicId: 't2', status: 'completed', estimatedMinutes: 50 }),
      makeTask({ id: 'task2', planTopicId: 't1', taskType: 'uworld_questions', status: 'completed', estimatedMinutes: 50 }),
    ]
    expect(calculateLearningProgress(topics, tasks).completed).toBe(0)
  })

  it('treats missing personalizedLearningMinutes as 0', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: undefined })]
    const result = calculateLearningProgress(topics, [])
    expect(result.total).toBe(0)
    expect(result.percent).toBe(0)
    expect(result.topics[0].baseline).toBe(0)
  })

  it('regression: only learning tasks contribute, not consolidation or uworld', () => {
    const topics = [makeTopic({ personalizedLearningMinutes: 60 })]
    const tasks = [
      makeTask({ taskType: 'learning', status: 'completed', estimatedMinutes: 20 }),
      makeTask({ id: 'task2', taskType: 'learning', status: 'partial', estimatedMinutes: 30, completionPercentage: 50 }),
      makeTask({ id: 'task3', taskType: 'consolidation', status: 'completed', estimatedMinutes: 30 }),
      makeTask({ id: 'task4', taskType: 'uworld_questions', status: 'completed', estimatedMinutes: 20 }),
    ]
    const result = calculateLearningProgress(topics, tasks)
    expect(result.completed).toBe(35)
    expect(result.percent).toBe(58)
  })
})

describe('calculateUworldProgress', () => {
  it('returns zeros for empty array', () => {
    expect(calculateUworldProgress([])).toEqual({ total: 0, completed: 0, percent: 0 })
  })

  it('sums total and completed across topics', () => {
    const topics = [
      makeTopic({ totalUworldQuestions: 40, completedUworldQuestions: 10 }),
      makeTopic({ id: 't2', totalUworldQuestions: 60, completedUworldQuestions: 30 }),
    ]
    const result = calculateUworldProgress(topics)
    expect(result.total).toBe(100)
    expect(result.completed).toBe(40)
    expect(result.percent).toBe(40)
  })

  it('treats missing fields as zero', () => {
    const topics = [makeTopic({ totalUworldQuestions: undefined, completedUworldQuestions: undefined })]
    expect(calculateUworldProgress(topics)).toEqual({ total: 0, completed: 0, percent: 0 })
  })

  it('returns 100% when all questions completed', () => {
    const topics = [makeTopic({ totalUworldQuestions: 50, completedUworldQuestions: 50 })]
    expect(calculateUworldProgress(topics).percent).toBe(100)
  })

  it('rounds percent correctly', () => {
    const topics = [makeTopic({ totalUworldQuestions: 3, completedUworldQuestions: 1 })]
    expect(calculateUworldProgress(topics).percent).toBe(33)
  })
})

describe('calculateIncorrectReviewProgress', () => {
  it('returns zeros for empty array', () => {
    const result = calculateIncorrectReviewProgress([])
    expect(result).toEqual({ generated: 0, reviewed: 0, remaining: 0, percent: 0 })
  })

  it('returns 0% when no questions generated', () => {
    const tasks = [makeTask({ taskType: 'incorrect_review', completedCount: 10 })]
    const result = calculateIncorrectReviewProgress(tasks)
    expect(result.percent).toBe(0)
    expect(result.generated).toBe(0)
  })

  it('calculates generated from uworld_questions tasks', () => {
    const tasks = [
      makeTask({ taskType: 'uworld_questions', incorrectCount: 10 }),
      makeTask({ id: 'task2', taskType: 'uworld_questions', incorrectCount: 5 }),
    ]
    expect(calculateIncorrectReviewProgress(tasks).generated).toBe(15)
  })

  it('calculates reviewed from incorrect_review tasks', () => {
    const tasks = [
      makeTask({ taskType: 'incorrect_review', completedCount: 3 }),
      makeTask({ id: 'task2', taskType: 'incorrect_review', completedCount: 7 }),
    ]
    expect(calculateIncorrectReviewProgress(tasks).reviewed).toBe(10)
  })

  it('caps remaining at zero when reviewed exceeds generated', () => {
    const tasks = [
      makeTask({ taskType: 'uworld_questions', incorrectCount: 5 }),
      makeTask({ id: 'task2', taskType: 'incorrect_review', completedCount: 10 }),
    ]
    expect(calculateIncorrectReviewProgress(tasks).remaining).toBe(0)
  })

  it('ignores tasks with other taskTypes', () => {
    const tasks = [makeTask({ taskType: 'learning', incorrectCount: 10, completedCount: 10 })]
    const result = calculateIncorrectReviewProgress(tasks)
    expect(result.generated).toBe(0)
    expect(result.reviewed).toBe(0)
  })

  it('treats missing counts as zero', () => {
    const tasks = [
      makeTask({ taskType: 'uworld_questions', incorrectCount: undefined }),
      makeTask({ id: 'task2', taskType: 'incorrect_review', completedCount: undefined }),
    ]
    expect(calculateIncorrectReviewProgress(tasks).generated).toBe(0)
    expect(calculateIncorrectReviewProgress(tasks).reviewed).toBe(0)
  })

  it('calculates percent correctly', () => {
    const tasks = [
      makeTask({ taskType: 'uworld_questions', incorrectCount: 20 }),
      makeTask({ id: 'task2', taskType: 'incorrect_review', completedCount: 10 }),
    ]
    expect(calculateIncorrectReviewProgress(tasks).percent).toBe(50)
  })
})

describe('buildScheduledVsLoggedSeries', () => {
  it('returns pastDays + futureDays + 1 entries', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20', 7, 3)
    expect(result).toHaveLength(11)
  })

  it('marks today correctly', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20', 7, 3)
    const todayEntry = result.find((e) => e.isToday)
    expect(todayEntry.date).toBe('2026-07-20')
    expect(todayEntry.isPast).toBe(false)
  })

  it('marks past days correctly', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20', 7, 3)
    const pastEntries = result.filter((e) => e.isPast)
    expect(pastEntries).toHaveLength(7)
    expect(pastEntries.every((e) => e.date < '2026-07-20')).toBe(true)
  })

  it('future days are neither past nor today', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20', 7, 3)
    const futureEntries = result.filter((e) => !e.isPast && !e.isToday)
    expect(futureEntries).toHaveLength(3)
  })

  it('sums scheduled minutes for tasks on the same day', () => {
    const tasks = [
      makeTask({ taskDate: '2026-07-20', estimatedMinutes: 30 }),
      makeTask({ id: 'task2', taskDate: '2026-07-20', estimatedMinutes: 45 }),
    ]
    const result = buildScheduledVsLoggedSeries(tasks, '2026-07-20')
    const today = result.find((e) => e.isToday)
    expect(today.scheduled).toBe(75)
  })

  it('sums logged minutes only when actualMinutes > 0', () => {
    const tasks = [
      makeTask({ taskDate: '2026-07-20', actualMinutes: 20 }),
      makeTask({ id: 'task2', taskDate: '2026-07-20', actualMinutes: 0 }),
      makeTask({ id: 'task3', taskDate: '2026-07-20', actualMinutes: null }),
      makeTask({ id: 'task4', taskDate: '2026-07-20', actualMinutes: undefined }),
    ]
    const result = buildScheduledVsLoggedSeries(tasks, '2026-07-20')
    const today = result.find((e) => e.isToday)
    expect(today.logged).toBe(20)
  })

  it('handles tasks with missing estimatedMinutes', () => {
    const tasks = [makeTask({ taskDate: '2026-07-20', estimatedMinutes: undefined })]
    const result = buildScheduledVsLoggedSeries(tasks, '2026-07-20')
    const today = result.find((e) => e.isToday)
    expect(today.scheduled).toBe(0)
  })

  it('all entries have required keys', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20')
    for (const entry of result) {
      expect(entry).toHaveProperty('date')
      expect(entry).toHaveProperty('scheduled')
      expect(entry).toHaveProperty('logged')
      expect(entry).toHaveProperty('isPast')
      expect(entry).toHaveProperty('isToday')
    }
  })

  it('produces valid date strings in YYYY-MM-DD format', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-01-05', 2, 2)
    for (const entry of result) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('produces consecutive dates', () => {
    const result = buildScheduledVsLoggedSeries([], '2026-07-20', 2, 2)
    const dates = result.map((e) => e.date)
    expect(dates).toEqual([
      '2026-07-18',
      '2026-07-19',
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ])
  })

  it('returns zero scheduled and logged when no tasks match', () => {
    const tasks = [makeTask({ taskDate: '2025-01-01', estimatedMinutes: 100, actualMinutes: 60 })]
    const result = buildScheduledVsLoggedSeries(tasks, '2026-07-20', 7, 3)
    expect(result.every((e) => e.scheduled === 0 && e.logged === 0)).toBe(true)
  })

  it('spreads tasks across multiple days correctly', () => {
    const tasks = [
      makeTask({ taskDate: '2026-07-19', estimatedMinutes: 20, actualMinutes: 15 }),
      makeTask({ id: 'task2', taskDate: '2026-07-20', estimatedMinutes: 40, actualMinutes: 35 }),
      makeTask({ id: 'task3', taskDate: '2026-07-21', estimatedMinutes: 60, actualMinutes: 0 }),
    ]
    const result = buildScheduledVsLoggedSeries(tasks, '2026-07-20')
    const past = result.find((e) => e.date === '2026-07-19')
    const today = result.find((e) => e.date === '2026-07-20')
    const future = result.find((e) => e.date === '2026-07-21')
    expect(past.scheduled).toBe(20)
    expect(past.logged).toBe(15)
    expect(today.scheduled).toBe(40)
    expect(today.logged).toBe(35)
    expect(future.scheduled).toBe(60)
    expect(future.logged).toBe(0)
  })
})

describe('summarizeTopicStatuses', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeTopicStatuses([])).toEqual([])
  })

  it('returns single status entry', () => {
    const topics = [makeTopic({ status: 'completed' })]
    expect(summarizeTopicStatuses(topics)).toEqual([
      { status: 'completed', count: 1, label: 'Completed' },
    ])
  })

  it('sorts by count descending', () => {
    const topics = [
      makeTopic({ status: 'completed' }),
      makeTopic({ id: 't2', status: 'learning' }),
      makeTopic({ id: 't3', status: 'learning' }),
      makeTopic({ id: 't4', status: 'learning' }),
    ]
    const result = summarizeTopicStatuses(topics)
    expect(result[0].status).toBe('learning')
    expect(result[0].count).toBe(3)
    expect(result[1].status).toBe('completed')
    expect(result[1].count).toBe(1)
  })

  it('uses known labels for known statuses', () => {
    const topics = [
      makeTopic({ status: 'uworld_in_progress' }),
      makeTopic({ id: 't2', status: 'questions_locked' }),
      makeTopic({ id: 't3', status: 'not_started' }),
    ]
    const result = summarizeTopicStatuses(topics)
    expect(result.find((r) => r.status === 'uworld_in_progress').label).toBe('UWorld In Progress')
    expect(result.find((r) => r.status === 'questions_locked').label).toBe('Questions Locked')
    expect(result.find((r) => r.status === 'not_started').label).toBe('Not Started')
  })

  it('falls back to status string for unknown statuses', () => {
    const topics = [makeTopic({ status: 'custom_status' })]
    const result = summarizeTopicStatuses(topics)
    expect(result[0].label).toBe('custom_status')
  })

  it('includes all statuses present', () => {
    const statuses = ['completed', 'learning', 'uworld_in_progress', 'not_started']
    const topics = statuses.map((s, i) => makeTopic({ id: 't' + i, status: s }))
    expect(summarizeTopicStatuses(topics)).toHaveLength(4)
  })
})

describe('findDelayedTopics', () => {
  it('returns empty array for empty inputs', () => {
    expect(findDelayedTopics([], [], '2026-07-20')).toEqual([])
  })

  it('returns empty when no overdue tasks', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-20', status: 'pending' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toEqual([])
  })

  it('finds topic with overdue pending task', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'pending' })]
    const result = findDelayedTopics(topics, tasks, '2026-07-20')
    expect(result).toHaveLength(1)
    expect(result[0].topicId).toBe('t1')
    expect(result[0].reason).toBe('1 overdue task')
  })

  it('finds topic with overdue in_progress task', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'in_progress' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(1)
  })

  it('finds topic with overdue locked task', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'locked' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(1)
  })

  it('ignores completed overdue tasks', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'completed' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(0)
  })

  it('ignores tasks due today', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: '2026-07-20', status: 'pending' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(0)
  })

  it('ignores tasks with no taskDate', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [makeTask({ taskDate: null, status: 'pending' })]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(0)
  })

  it('counts multiple overdue tasks and pluralizes reason', () => {
    const topics = [makeTopic({ id: 't1' })]
    const tasks = [
      makeTask({ taskDate: '2026-07-15', status: 'pending' }),
      makeTask({ id: 'task2', taskDate: '2026-07-16', status: 'in_progress' }),
      makeTask({ id: 'task3', taskDate: '2026-07-14', status: 'locked' }),
    ]
    const result = findDelayedTopics(topics, tasks, '2026-07-20')
    expect(result[0].reason).toBe('3 overdue tasks')
  })

  it('returns multiple delayed topics', () => {
    const topics = [
      makeTopic({ id: 't1' }),
      makeTopic({ id: 't2', topicTitle: 'Neurology' }),
    ]
    const tasks = [
      makeTask({ planTopicId: 't1', taskDate: '2026-07-15', status: 'pending' }),
      makeTask({ id: 'task2', planTopicId: 't2', taskDate: '2026-07-16', status: 'in_progress' }),
    ]
    expect(findDelayedTopics(topics, tasks, '2026-07-20')).toHaveLength(2)
  })

  it('includes groupId in result', () => {
    const topics = [makeTopic({ id: 't1', groupId: 'g5' })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'pending' })]
    const result = findDelayedTopics(topics, tasks, '2026-07-20')
    expect(result[0].groupId).toBe('g5')
  })

  it('skips topics with no tasks', () => {
    const topics = [makeTopic({ id: 't1' })]
    expect(findDelayedTopics(topics, [], '2026-07-20')).toHaveLength(0)
  })
})

describe('findTopicsNeedingAttention', () => {
  it('returns empty array for empty inputs', () => {
    expect(findTopicsNeedingAttention([], [], '2026-07-20')).toEqual([])
  })

  it('returns empty when no issues', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 0 })]
    expect(findTopicsNeedingAttention(topics, [], '2026-07-20')).toEqual([])
  })

  it('reports topic with incorrect questions', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 5 })]
    const result = findTopicsNeedingAttention(topics, [], '2026-07-20')
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toContain('5 incorrect questions remaining')
  })

  it('singular form for 1 incorrect question', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 1 })]
    const result = findTopicsNeedingAttention(topics, [], '2026-07-20')
    expect(result[0].reasons).toContain('1 incorrect question remaining')
  })

  it('reports topic with overdue tasks', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 0 })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'pending' })]
    const result = findTopicsNeedingAttention(topics, tasks, '2026-07-20')
    expect(result).toHaveLength(1)
    expect(result[0].reasons).toContain('1 overdue task')
  })

  it('reports both incorrect questions and overdue tasks', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 3 })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'pending' })]
    const result = findTopicsNeedingAttention(topics, tasks, '2026-07-20')
    expect(result[0].reasons).toHaveLength(2)
    expect(result[0].reasons).toContain('3 incorrect questions remaining')
    expect(result[0].reasons).toContain('1 overdue task')
  })

  it('ignores completed tasks as overdue', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 0 })]
    const tasks = [makeTask({ taskDate: '2026-07-15', status: 'completed' })]
    expect(findTopicsNeedingAttention(topics, tasks, '2026-07-20')).toHaveLength(0)
  })

  it('ignores future-dated tasks', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 0 })]
    const tasks = [makeTask({ taskDate: '2026-07-25', status: 'pending' })]
    expect(findTopicsNeedingAttention(topics, tasks, '2026-07-20')).toHaveLength(0)
  })

  it('returns multiple topics needing attention', () => {
    const topics = [
      makeTopic({ id: 't1', incorrectQuestionsRemaining: 2 }),
      makeTopic({ id: 't2', incorrectQuestionsRemaining: 0 }),
      makeTopic({ id: 't3', incorrectQuestionsRemaining: 1 }),
    ]
    expect(findTopicsNeedingAttention(topics, [], '2026-07-20')).toHaveLength(2)
  })

  it('skips topics with no reason', () => {
    const topics = [
      makeTopic({ id: 't1', incorrectQuestionsRemaining: 0 }),
      makeTopic({ id: 't2', incorrectQuestionsRemaining: 0 }),
    ]
    expect(findTopicsNeedingAttention(topics, [], '2026-07-20')).toHaveLength(0)
  })

  it('includes groupId and topicTitle in result', () => {
    const topics = [makeTopic({ incorrectQuestionsRemaining: 2, groupId: 'g9', topicTitle: 'Renal' })]
    const result = findTopicsNeedingAttention(topics, [], '2026-07-20')
    expect(result[0].groupId).toBe('g9')
    expect(result[0].topicTitle).toBe('Renal')
  })
})

describe('summarizeConfidence', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeConfidence([])).toEqual([])
  })

  it('ignores topics without estimateConfidence', () => {
    const topics = [
      makeTopic({ estimateConfidence: null }),
      makeTopic({ id: 't2', estimateConfidence: undefined }),
    ]
    expect(summarizeConfidence(topics)).toEqual([])
  })

  it('counts confidence levels', () => {
    const topics = [
      makeTopic({ estimateConfidence: 'high' }),
      makeTopic({ id: 't2', estimateConfidence: 'high' }),
      makeTopic({ id: 't3', estimateConfidence: 'low' }),
    ]
    const result = summarizeConfidence(topics)
    expect(result).toEqual([
      { confidence: 'high', count: 2 },
      { confidence: 'low', count: 1 },
    ])
  })

  it('sorts by count descending', () => {
    const topics = [
      makeTopic({ estimateConfidence: 'low' }),
      makeTopic({ id: 't2', estimateConfidence: 'medium' }),
      makeTopic({ id: 't3', estimateConfidence: 'medium' }),
      makeTopic({ id: 't4', estimateConfidence: 'medium' }),
    ]
    const result = summarizeConfidence(topics)
    expect(result[0].confidence).toBe('medium')
    expect(result[0].count).toBe(3)
    expect(result[1].confidence).toBe('low')
    expect(result[1].count).toBe(1)
  })

  it('handles single topic', () => {
    const topics = [makeTopic({ estimateConfidence: 'high' })]
    expect(summarizeConfidence(topics)).toEqual([{ confidence: 'high', count: 1 }])
  })

  it('mix of defined and undefined estimateConfidence', () => {
    const topics = [
      makeTopic({ estimateConfidence: 'high' }),
      makeTopic({ id: 't2', estimateConfidence: null }),
      makeTopic({ id: 't3', estimateConfidence: 'low' }),
      makeTopic({ id: 't4', estimateConfidence: undefined }),
    ]
    const result = summarizeConfidence(topics)
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.confidence === 'high').count).toBe(1)
    expect(result.find((r) => r.confidence === 'low').count).toBe(1)
  })
})
