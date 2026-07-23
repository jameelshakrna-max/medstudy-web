import { describe, it, expect } from 'vitest';
import {
  TODAY_SECTIONS,
  groupTasksBySection,
  sortTasksForSection,
  calculateSectionProgress,
  calculateDayProgress,
} from '../todayGrouping';

function makeTask(overrides) {
  return {
    id: '1',
    taskType: 'learning',
    status: 'pending',
    taskDate: '2025-07-15',
    estimatedMinutes: 30,
    displayOrder: 0,
    completionPercentage: 0,
    ...overrides,
  };
}

describe('TODAY_SECTIONS', () => {
  it('is an array of 7 sections', () => {
    expect(TODAY_SECTIONS).toHaveLength(7);
  });

  it('has unique keys', () => {
    const keys = TODAY_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('active filter matches in_progress status', () => {
    const active = TODAY_SECTIONS.find((s) => s.key === 'active');
    expect(active.filter(makeTask({ status: 'in_progress' }))).toBe(true);
    expect(active.filter(makeTask({ status: 'pending' }))).toBe(false);
  });

  it('overdue filter excludes completed, skipped, in_progress', () => {
    const overdue = TODAY_SECTIONS.find((s) => s.key === 'overdue');
    const base = { status: 'pending', taskType: 'learning', taskDate: '2025-07-14' };
    expect(overdue.filter(makeTask(base), '2025-07-15')).toBe(true);
    expect(overdue.filter(makeTask({ ...base, status: 'completed' }), '2025-07-15')).toBe(false);
    expect(overdue.filter(makeTask({ ...base, status: 'skipped' }), '2025-07-15')).toBe(false);
    expect(overdue.filter(makeTask({ ...base, status: 'in_progress' }), '2025-07-15')).toBe(false);
  });

  it('overdue filter excludes partial (historical, not actionable)', () => {
    const overdue = TODAY_SECTIONS.find((s) => s.key === 'overdue');
    expect(overdue.filter(makeTask({ status: 'partial', taskDate: '2025-07-14' }), '2025-07-15')).toBe(false);
  });

  it('overdue filter includes pending', () => {
    const overdue = TODAY_SECTIONS.find((s) => s.key === 'overdue');
    expect(overdue.filter(makeTask({ status: 'pending', taskDate: '2025-07-14' }), '2025-07-15')).toBe(true);
  });

  it('overdue filter includes locked', () => {
    const overdue = TODAY_SECTIONS.find((s) => s.key === 'overdue');
    expect(overdue.filter(makeTask({ status: 'locked', taskDate: '2025-07-14' }), '2025-07-15')).toBe(true);
  });

  it('overdue filter requires taskDate before todayKey', () => {
    const overdue = TODAY_SECTIONS.find((s) => s.key === 'overdue');
    expect(overdue.filter(makeTask({ taskDate: '2025-07-16', status: 'pending' }), '2025-07-15')).toBe(false);
  });

  it('due_reviews filter matches flashcard_review on today', () => {
    const dueReviews = TODAY_SECTIONS.find((s) => s.key === 'due_reviews');
    expect(dueReviews.filter(makeTask({ taskType: 'flashcard_review', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(true);
    expect(dueReviews.filter(makeTask({ taskType: 'flashcard_review', taskDate: '2025-07-15', status: 'completed' }), '2025-07-15')).toBe(false);
    expect(dueReviews.filter(makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(false);
  });

  it('learn filter matches learning and consolidation', () => {
    const learn = TODAY_SECTIONS.find((s) => s.key === 'learn');
    expect(learn.filter(makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(true);
    expect(learn.filter(makeTask({ taskType: 'consolidation', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(true);
    expect(learn.filter(makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'in_progress' }), '2025-07-15')).toBe(false);
  });

  it('uworld filter matches uworld_questions', () => {
    const uworld = TODAY_SECTIONS.find((s) => s.key === 'uworld');
    expect(uworld.filter(makeTask({ taskType: 'uworld_questions', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(true);
    expect(uworld.filter(makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(false);
  });
});

describe('sortTasksForSection', () => {
  it('puts in_progress tasks first', () => {
    const tasks = [
      makeTask({ id: '1', status: 'pending', displayOrder: 1 }),
      makeTask({ id: '2', status: 'in_progress', displayOrder: 3 }),
      makeTask({ id: '3', status: 'completed', displayOrder: 0 }),
    ];
    const sorted = sortTasksForSection(tasks);
    expect(sorted[0].id).toBe('2');
  });

  it('sorts remaining tasks by displayOrder ascending', () => {
    const tasks = [
      makeTask({ id: '1', status: 'pending', displayOrder: 3 }),
      makeTask({ id: '2', status: 'pending', displayOrder: 1 }),
      makeTask({ id: '3', status: 'pending', displayOrder: 2 }),
    ];
    const sorted = sortTasksForSection(tasks);
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });

  it('treats undefined displayOrder as 0', () => {
    const tasks = [
      makeTask({ id: '1', status: 'pending', displayOrder: undefined }),
      makeTask({ id: '2', status: 'pending', displayOrder: 1 }),
    ];
    const sorted = sortTasksForSection(tasks);
    expect(sorted[0].id).toBe('1');
  });

  it('does not mutate the original array', () => {
    const tasks = [
      makeTask({ id: '1', displayOrder: 2 }),
      makeTask({ id: '2', displayOrder: 1 }),
    ];
    sortTasksForSection(tasks);
    expect(tasks[0].id).toBe('1');
  });
});

describe('groupTasksBySection', () => {
  it('returns only sections with matching tasks', () => {
    const tasks = [
      makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'pending' }),
    ];
    const sections = groupTasksBySection(tasks, '2025-07-15');
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections.some((s) => s.key === 'learn')).toBe(true);
  });

  it('returns empty array when no tasks match', () => {
    const sections = groupTasksBySection([], '2025-07-15');
    expect(sections).toEqual([]);
  });

  it('sections contain sorted tasks', () => {
    const tasks = [
      makeTask({ id: '1', taskType: 'learning', taskDate: '2025-07-15', status: 'pending', displayOrder: 3 }),
      makeTask({ id: '2', taskType: 'learning', taskDate: '2025-07-15', status: 'pending', displayOrder: 1 }),
      makeTask({ id: '3', taskType: 'learning', taskDate: '2025-07-15', status: 'pending', displayOrder: 2 }),
    ];
    const sections = groupTasksBySection(tasks, '2025-07-15');
    const learnSection = sections.find((s) => s.key === 'learn');
    expect(learnSection).toBeDefined();
    expect(learnSection.tasks[0].id).toBe('2');
    expect(learnSection.tasks[1].id).toBe('3');
    expect(learnSection.tasks[2].id).toBe('1');
  });

  it('correctly groups overdue tasks', () => {
    const tasks = [
      makeTask({ taskType: 'learning', taskDate: '2025-07-14', status: 'pending' }),
      makeTask({ taskType: 'uworld_questions', taskDate: '2025-07-15', status: 'pending' }),
    ];
    const sections = groupTasksBySection(tasks, '2025-07-15');
    const overdue = sections.find((s) => s.key === 'overdue');
    expect(overdue).toBeDefined();
    expect(overdue.tasks).toHaveLength(1);
  });

  it('returns sections in TODAY_SECTIONS order', () => {
    const tasks = [
      makeTask({ taskType: 'optional_book_questions', taskDate: '2025-07-15', status: 'pending' }),
      makeTask({ status: 'in_progress', taskDate: '2025-07-15' }),
      makeTask({ taskType: 'learning', taskDate: '2025-07-15', status: 'pending' }),
    ];
    const sections = groupTasksBySection(tasks, '2025-07-15');
    const keys = sections.map((s) => s.key);
    const activeIdx = keys.indexOf('active');
    const practiceIdx = keys.indexOf('practice');
    const learnIdx = keys.indexOf('learn');
    expect(activeIdx).toBeLessThan(learnIdx);
    expect(learnIdx).toBeLessThan(practiceIdx);
  });
});

describe('calculateSectionProgress', () => {
  it('counts completed and partial as completed', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 10 }),
      makeTask({ status: 'partial', estimatedMinutes: 20 }),
      makeTask({ status: 'pending', estimatedMinutes: 15 }),
    ];
    const result = calculateSectionProgress(tasks);
    expect(result.completed).toBe(2);
    expect(result.total).toBe(3);
    expect(result.percent).toBeCloseTo(2 / 3);
    expect(result.totalMinutes).toBe(45);
  });

  it('returns percent 0 for empty array', () => {
    const result = calculateSectionProgress([]);
    expect(result.completed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  it('handles tasks with missing estimatedMinutes', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: undefined }),
      makeTask({ status: 'pending', estimatedMinutes: undefined }),
    ];
    const result = calculateSectionProgress(tasks);
    expect(result.totalMinutes).toBe(0);
  });
});

describe('calculateDayProgress', () => {
  it('returns zeros for empty array', () => {
    const result = calculateDayProgress([], '2025-07-15');
    expect(result).toEqual({
      totalTasks: 0,
      completedTasks: 0,
      activeTasks: 0,
      overdueTasks: 0,
      totalMinutes: 0,
      completedMinutes: 0,
      weightedProgress: 0,
    });
  });

  it('counts completed tasks correctly', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 30 }),
      makeTask({ status: 'partial', estimatedMinutes: 20 }),
      makeTask({ status: 'pending', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.completedTasks).toBe(2);
    expect(result.completedMinutes).toBe(50);
  });

  it('counts active tasks correctly', () => {
    const tasks = [
      makeTask({ status: 'in_progress', estimatedMinutes: 15 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.activeTasks).toBe(1);
  });

  it('counts overdue tasks correctly', () => {
    const tasks = [
      makeTask({ taskDate: '2025-07-14', status: 'pending', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.overdueTasks).toBe(1);
  });

  it('counts locked tasks as overdue', () => {
    const tasks = [
      makeTask({ taskDate: '2025-07-14', status: 'locked', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.overdueTasks).toBe(1);
  });

  it('does not count partial tasks as overdue', () => {
    const tasks = [
      makeTask({ taskDate: '2025-07-14', status: 'partial', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.overdueTasks).toBe(0);
  });

  it('excludes skipped from overdue count', () => {
    const tasks = [
      makeTask({ taskDate: '2025-07-14', status: 'skipped', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.overdueTasks).toBe(0);
  });

  it('weightedProgress weights by estimatedMinutes', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 30 }),
      makeTask({ status: 'pending', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    // 30*1 + 10*0 = 30, total weight = 40
    expect(result.weightedProgress).toBeCloseTo(30 / 40);
  });

  it('partial task uses completionPercentage for weightedProgress', () => {
    const tasks = [
      makeTask({ status: 'partial', estimatedMinutes: 20, completionPercentage: 60 }),
      makeTask({ status: 'pending', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    // 20*0.6 + 10*0 = 12, total weight = 30
    expect(result.weightedProgress).toBeCloseTo(12 / 30);
  });

  it('weightedProgress is 1 when all tasks completed with minutes', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 20 }),
      makeTask({ status: 'completed', estimatedMinutes: 10 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.weightedProgress).toBe(1);
  });

  it('weightedProgress is 0 when totalMinutes is 0', () => {
    const tasks = [
      makeTask({ status: 'completed', estimatedMinutes: 0 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.weightedProgress).toBe(0);
  });
});

describe('default export', () => {
  it('contains all exports', async () => {
    const mod = await import('../todayGrouping');
    expect(mod.default.TODAY_SECTIONS).toBe(TODAY_SECTIONS);
    expect(mod.default.groupTasksBySection).toBe(groupTasksBySection);
    expect(mod.default.sortTasksForSection).toBe(sortTasksForSection);
    expect(mod.default.calculateSectionProgress).toBe(calculateSectionProgress);
    expect(mod.default.calculateDayProgress).toBe(calculateDayProgress);
  });
});
