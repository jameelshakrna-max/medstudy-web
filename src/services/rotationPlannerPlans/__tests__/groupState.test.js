import { describe, it, expect } from 'vitest'
import { deriveActualGroupStates } from '../groupState.js'

function makeGroup(overrides = {}) {
  return {
    id: 'group-1',
    key: 'ischemic-heart-disease',
    title: 'Ischemic Heart Disease',
    system: 'uworld',
    targetQuestions: 30,
    memberTopicIds: ['cardiology.stable-angina-pectoris', 'cardiology.acute-coronary-syndromes-acs'],
    requiredTopicIds: ['cardiology.stable-angina-pectoris', 'cardiology.acute-coronary-syndromes-acs'],
    excluded: 0,
    displayOrder: 0,
    ...overrides,
  }
}

function makeTopic(sourceId, overrides = {}) {
  return {
    id: `topic-${sourceId.replace('cardiology.', '')}`,
    source_topic_id: sourceId,
    personalized_learning_minutes: 30,
    learning_completed_at: null,
    status: 'not_started',
    ...overrides,
  }
}

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    plan_topic_id: null,
    plan_question_group_id: null,
    task_type: 'uworld_questions',
    status: 'pending',
    completion_percentage: 0,
    estimated_minutes: 30,
    target_count: 0,
    completed_count: 0,
    incorrect_count: 0,
    completed_on: null,
    ...overrides,
  }
}

describe('deriveActualGroupStates', () => {
  it('reports pending with zero progress when no tasks exist', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris'),
      makeTopic('cardiology.acute-coronary-syndromes-acs'),
    ]
    const states = deriveActualGroupStates(groups, topics, [])
    expect(states[0]).toMatchObject({
      key: 'ischemic-heart-disease',
      completedQuestions: 0,
      remainingQuestions: 30,
      incorrectQuestionsRemaining: 0,
      requiredLearningCompleted: false,
      status: 'locked',
      unlockedAt: null,
    })
  })

  it('unlocks when all required learning is completed and reports unlockedAt', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const states = deriveActualGroupStates(groups, topics, [])
    expect(states[0].requiredLearningCompleted).toBe(true)
    expect(states[0].unlockedAt).toBe('2026-01-05')
    expect(states[0].status).toBe('pending')
    expect(states[0].unfinishedRequiredTopics).toEqual([])
  })

  it('derives learning completion from learning task history even without learning_completed_at', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris'),
      makeTopic('cardiology.acute-coronary-syndromes-acs'),
    ]
    const tasks = [
      makeTask({ task_type: 'learning', plan_topic_id: 'topic-stable-angina-pectoris', status: 'completed', estimated_minutes: 30 }),
      makeTask({ task_type: 'learning', plan_topic_id: 'topic-acute-coronary-syndromes-acs', status: 'completed', estimated_minutes: 30 }),
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].requiredLearningCompleted).toBe(true)
  })

  it('tracks completed and remaining questions from group uworld tasks', () => {
    const groups = [makeGroup({ targetQuestions: 30 })]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const tasks = [
      makeTask({ plan_question_group_id: 'group-1', target_count: 15, completed_count: 10, incorrect_count: 3, status: 'partial', completion_percentage: 50 }),
      makeTask({ plan_question_group_id: 'group-1', target_count: 15, completed_count: 0, incorrect_count: 0 }),
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].completedQuestions).toBe(10)
    expect(states[0].remainingQuestions).toBe(20)
    expect(states[0].incorrectQuestionsRemaining).toBe(3)
    expect(states[0].status).toBe('in_progress')
  })

  it('reduces incorrectQuestionsRemaining by completed group incorrect_review tasks', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const tasks = [
      makeTask({ plan_question_group_id: 'group-1', target_count: 30, completed_count: 30, incorrect_count: 5, status: 'completed' }),
      makeTask({ task_type: 'incorrect_review', plan_question_group_id: 'group-1', target_count: 5, completed_count: 2, status: 'partial', completion_percentage: 50 }),
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].incorrectQuestionsRemaining).toBe(3)
    expect(states[0].status).toBe('in_progress')
  })

  it('never reports negative incorrectQuestionsRemaining', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const tasks = [
      makeTask({ plan_question_group_id: 'group-1', target_count: 30, completed_count: 30, incorrect_count: 2, status: 'completed' }),
      makeTask({ task_type: 'incorrect_review', plan_question_group_id: 'group-1', target_count: 5, completed_count: 5, status: 'completed' }),
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].incorrectQuestionsRemaining).toBe(0)
    expect(states[0].status).toBe('completed')
  })

  it('reports excluded groups as excluded', () => {
    const groups = [makeGroup({ excluded: 1 })]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const states = deriveActualGroupStates(groups, topics, [])
    expect(states[0].status).toBe('excluded')
    expect(states[0].excluded).toBe(true)
  })

  it('lists unfinished required topics', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs'),
    ]
    const states = deriveActualGroupStates(groups, topics, [])
    expect(states[0].unfinishedRequiredTopics).toEqual(['cardiology.acute-coronary-syndromes-acs'])
    expect(states[0].requiredLearningCompleted).toBe(false)
  })

  it('ignores tasks that do not belong to the group', () => {
    const groups = [makeGroup()]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris', { learning_completed_at: '2026-01-04' }),
      makeTopic('cardiology.acute-coronary-syndromes-acs', { learning_completed_at: '2026-01-05' }),
    ]
    const tasks = [
      makeTask({ plan_topic_id: 'topic-stable-angina-pectoris', target_count: 100, completed_count: 100 }),
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].completedQuestions).toBe(0)
    expect(states[0].remainingQuestions).toBe(30)
    expect(states[0].status).toBe('pending')
  })

  it('derives the same group states from camelCase DTO task rows (GET handler shape)', () => {
    const groups = [makeGroup({ targetQuestions: 30 })]
    const topics = [
      makeTopic('cardiology.stable-angina-pectoris'),
      makeTopic('cardiology.acute-coronary-syndromes-acs'),
    ]
    const tasks = [
      { id: 't1', planTopicId: 'topic-stable-angina-pectoris', taskType: 'learning', status: 'completed', estimatedMinutes: 30 },
      { id: 't2', planTopicId: 'topic-acute-coronary-syndromes-acs', taskType: 'learning', status: 'completed', estimatedMinutes: 30 },
      { id: 't3', planQuestionGroupId: 'group-1', taskType: 'uworld_questions', status: 'partial', completionPercentage: 50, targetCount: 15, completedCount: 10, incorrectCount: 3 },
      { id: 't4', planQuestionGroupId: 'group-1', taskType: 'uworld_questions', status: 'pending', targetCount: 15, completedCount: 0, incorrectCount: 0 },
      { id: 't5', planQuestionGroupId: 'group-1', taskType: 'incorrect_review', status: 'completed', targetCount: 1, completedCount: 1 },
    ]
    const states = deriveActualGroupStates(groups, topics, tasks)
    expect(states[0].requiredLearningCompleted).toBe(true)
    expect(states[0].completedQuestions).toBe(10)
    expect(states[0].remainingQuestions).toBe(20)
    expect(states[0].incorrectQuestionsRemaining).toBe(2)
    expect(states[0].status).toBe('in_progress')
    expect(states[0].unfinishedRequiredTopics).toEqual([])
  })
})
