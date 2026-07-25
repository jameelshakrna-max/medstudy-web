// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopicsView from '../TopicsView'

vi.mock('../TopicsView.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

const SOURCE_TITLE = 'Step-Up to Medicine'

function makeTopic(overrides) {
  return {
    id: `topic-${Math.random().toString(36).slice(2, 8)}`,
    topicTitle: 'Stable Angina Pectoris',
    normalizedTopicId: 'amboss::cardiology.stable-angina',
    status: 'not_started',
    groupId: null,
    baseLearningMinutes: 45,
    personalizedLearningMinutes: 45,
    totalUworldQuestions: 20,
    completedUworldQuestions: 0,
    incorrectQuestionsRemaining: 0,
    learningCompletedAt: null,
    questionsUnlockedAt: null,
    displayOrder: 0,
    ...overrides,
  }
}

const notStarted = makeTopic({ id: 't1', topicTitle: 'Acute Pancreatitis', status: 'not_started', displayOrder: 0 })
const learning = makeTopic({ id: 't2', topicTitle: 'Stable Angina', status: 'learning', displayOrder: 1, groupId: 'Chest Pain' })
const questionsLocked = makeTopic({ id: 't3', topicTitle: 'Heart Failure', status: 'questions_locked', displayOrder: 2, groupId: 'Chest Pain', learningCompletedAt: '2026-07-20' })
const uworldInProgress = makeTopic({ id: 't4', topicTitle: 'Atrial Fibrillation', status: 'uworld_in_progress', displayOrder: 3, groupId: 'Chest Pain', learningCompletedAt: '2026-07-18', questionsUnlockedAt: '2026-07-19', completedUworldQuestions: 12, totalUworldQuestions: 20 })
const completed = makeTopic({ id: 't5', topicTitle: 'Upper GI Bleeding', status: 'completed', displayOrder: 4, groupId: 'Gastro', learningCompletedAt: '2026-07-15', questionsUnlockedAt: '2026-07-16', completedUworldQuestions: 20, totalUworldQuestions: 20, incorrectQuestionsRemaining: 0 })

const ALL_TOPICS = [notStarted, learning, questionsLocked, uworldInProgress, completed]

describe('TopicsView', () => {
  describe('summary header', () => {
    it('displays total topic count', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('5 topics')).toBeTruthy()
    })

    it('displays completed count', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('1 completed')).toBeTruthy()
    })

    it('displays active count', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('2 active')).toBeTruthy()
    })

    it('displays remaining count', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('2 remaining')).toBeTruthy()
    })

    it('displays UWorld progress when total > 0', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      const uworldSummary = document.querySelector('.summaryUworld')
      expect(uworldSummary).toBeTruthy()
      expect(uworldSummary.textContent).toContain('32')
      expect(uworldSummary.textContent).toContain('100')
    })

    it('hides UWorld progress when total is 0', () => {
      const topics = [makeTopic({ totalUworldQuestions: 0, completedUworldQuestions: 0 })]
      render(<TopicsView topics={topics} sourceTitle={SOURCE_TITLE} />)
      expect(document.querySelector('.summaryUworld')).toBeNull()
    })
  })

  describe('filter tabs', () => {
    it('renders all filter tabs', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Active' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Not Started' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Locked' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Completed' })).toBeTruthy()
    })

    it('shows all topics by default', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getAllByText(/Stable Angina|Acute Pancreatitis|Heart Failure|Atrial Fibrillation|Upper GI Bleeding/).length).toBe(5)
    })

    it('filters to active topics', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Active' }))
      expect(screen.getByText('Stable Angina')).toBeTruthy()
      expect(screen.getByText('Atrial Fibrillation')).toBeTruthy()
      expect(screen.queryByText('Acute Pancreatitis')).toBeNull()
      expect(screen.queryByText('Heart Failure')).toBeNull()
      expect(screen.queryByText('Upper GI Bleeding')).toBeNull()
    })

    it('filters to not started topics', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Not Started' }))
      expect(screen.getByText('Acute Pancreatitis')).toBeTruthy()
      expect(screen.queryByText('Stable Angina')).toBeNull()
    })

    it('filters to locked topics', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Locked' }))
      expect(screen.getByText('Heart Failure')).toBeTruthy()
      expect(screen.queryByText('Acute Pancreatitis')).toBeNull()
      expect(screen.queryByText('Stable Angina')).toBeNull()
    })

    it('filters to completed topics', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
      expect(screen.getByText('Upper GI Bleeding')).toBeTruthy()
      expect(screen.queryByText('Acute Pancreatitis')).toBeNull()
    })
  })

  describe('topic cards', () => {
    it('renders topic title', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('Stable Angina')).toBeTruthy()
    })

    it('renders source title', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText(SOURCE_TITLE)).toBeTruthy()
    })

    it('renders group id when present', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getAllByText(/Chest Pain/).length).toBeGreaterThanOrEqual(1)
    })

    it('hides group id when absent', () => {
      render(<TopicsView topics={[notStarted]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText(/Chest Pain/)).toBeNull()
    })

    it('never shows normalizedTopicId', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText(/amboss/)).toBeNull()
      expect(screen.queryByText(/cardiology\.stable-angina/)).toBeNull()
    })

    it('renders status badge with human-readable label', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getAllByText('Learning').length).toBeGreaterThanOrEqual(1)
    })

    it('renders human-readable status for questions_locked', () => {
      render(<TopicsView topics={[questionsLocked]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('Questions Locked')).toBeTruthy()
    })

    it('renders human-readable status for uworld_in_progress', () => {
      render(<TopicsView topics={[uworldInProgress]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('UWorld In Progress')).toBeTruthy()
    })
  })

  describe('pipeline rows', () => {
    it('omits learning row for not_started topic', () => {
      render(<TopicsView topics={[notStarted]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('Learning')).toBeNull()
    })

    it('shows "In progress" learning for learning topic', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('In progress')).toBeTruthy()
    })

    it('shows "Complete" learning when learningCompletedAt is set', () => {
      render(<TopicsView topics={[uworldInProgress]} sourceTitle={SOURCE_TITLE} />)
      const learningComplete = screen.getAllByText('Complete')
      expect(learningComplete.length).toBeGreaterThanOrEqual(1)
    })

    it('shows UWorld progress with question counts', () => {
      render(<TopicsView topics={[uworldInProgress]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('12 / 20 questions')).toBeTruthy()
      expect(screen.getByText('8 remaining')).toBeTruthy()
    })

    it('shows "Locked" with "Complete learning first" for questions_locked UWorld', () => {
      render(<TopicsView topics={[questionsLocked]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getAllByText('Locked').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Complete learning first')).toBeTruthy()
    })

    it('omits UWorld row when total is 0', () => {
      const topic = makeTopic({ totalUworldQuestions: 0 })
      render(<TopicsView topics={[topic]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('UWorld')).toBeNull()
    })

    it('shows incorrect review remaining for uworld_in_progress', () => {
      const topic = makeTopic({
        status: 'uworld_in_progress',
        learningCompletedAt: '2026-07-10',
        questionsUnlockedAt: '2026-07-11',
        completedUworldQuestions: 15,
        totalUworldQuestions: 20,
        incorrectQuestionsRemaining: 5,
      })
      render(<TopicsView topics={[topic]} sourceTitle={SOURCE_TITLE} />)
      const remaining = screen.getAllByText('5 remaining')
      expect(remaining.length).toBeGreaterThanOrEqual(1)
    })

    it('omits incorrect review for not_started topic', () => {
      render(<TopicsView topics={[notStarted]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('Incorrect Review')).toBeNull()
    })

    it('omits incorrect review for learning topic', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('Incorrect Review')).toBeNull()
    })

    it('omits incorrect review for questions_locked topic', () => {
      render(<TopicsView topics={[questionsLocked]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('Incorrect Review')).toBeNull()
    })

    it('shows "Complete" for incorrect review when 0 remaining', () => {
      render(<TopicsView topics={[completed]} sourceTitle={SOURCE_TITLE} />)
      const incorrectComplete = screen.getAllByText('Complete')
      expect(incorrectComplete.length).toBeGreaterThanOrEqual(2)
    })

    it('shows planned learning minutes', () => {
      render(<TopicsView topics={[learning]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('45 min')).toBeTruthy()
    })

    it('hides planned learning when minutes is 0', () => {
      const topic = makeTopic({ personalizedLearningMinutes: 0, baseLearningMinutes: 0 })
      render(<TopicsView topics={[topic]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('0 min')).toBeNull()
    })
  })

  describe('grouping', () => {
    it('groups topics by groupId', () => {
      render(<TopicsView topics={ALL_TOPICS} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('Chest Pain')).toBeTruthy()
      expect(screen.getByText('Gastro')).toBeTruthy()
    })

    it('renders ungrouped topics without group label', () => {
      const topics = [notStarted]
      render(<TopicsView topics={topics} sourceTitle={SOURCE_TITLE} />)
      expect(screen.queryByText('Chest Pain')).toBeNull()
    })
  })

  describe('empty state', () => {
    it('shows empty message when no topics match filter', () => {
      render(<TopicsView topics={[]} sourceTitle={SOURCE_TITLE} />)
      expect(screen.getByText('No topics match this filter.')).toBeTruthy()
    })

    it('shows empty when filter has no matches', () => {
      const topics = [notStarted]
      render(<TopicsView topics={topics} sourceTitle={SOURCE_TITLE} />)
      fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
      expect(screen.getByText('No topics match this filter.')).toBeTruthy()
    })
  })

  describe('deterministic ordering', () => {
    it('sorts topics by displayOrder within groups', () => {
      const t1 = makeTopic({ id: 't1', topicTitle: 'Second', groupId: 'A', displayOrder: 2 })
      const t2 = makeTopic({ id: 't2', topicTitle: 'First', groupId: 'A', displayOrder: 1 })
      const t3 = makeTopic({ id: 't3', topicTitle: 'Third', groupId: 'A', displayOrder: 3 })
      render(<TopicsView topics={[t1, t2, t3]} sourceTitle={SOURCE_TITLE} />)
      const first = screen.getByText('First')
      const second = screen.getByText('Second')
      const third = screen.getByText('Third')
      expect(first.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      expect(second.compareDocumentPosition(third)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })
})
