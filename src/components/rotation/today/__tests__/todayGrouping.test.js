import { describe, it, expect } from 'vitest';
import {
  TODAY_SECTIONS,
  groupTasksBySection,
  sortTasksForSection,
  claimActiveBlockSiblings,
  calculateSectionProgress,
  calculateDayProgress,
  classifyTodayState,
  classifyTodayReason,
  buildAvailabilityByWeekday,
  getDayAvailabilityEntry,
  findNextStudyDay,
  findNextFutureTask,
  getPrerequisiteName,
  getTodayRelevantTasks,
  groupTasksByDate,
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

  it('practice filter matches mixed_review on today', () => {
    const practice = TODAY_SECTIONS.find((s) => s.key === 'practice');
    expect(practice.filter(makeTask({ taskType: 'mixed_review', taskDate: '2025-07-15', status: 'pending' }), '2025-07-15')).toBe(true);
    expect(practice.filter(makeTask({ taskType: 'mixed_review', taskDate: '2025-07-15', status: 'completed' }), '2025-07-15')).toBe(false);
    expect(practice.filter(makeTask({ taskType: 'mixed_review', taskDate: '2025-07-15', status: 'in_progress' }), '2025-07-15')).toBe(false);
    expect(practice.filter(makeTask({ taskType: 'mixed_review', taskDate: '2025-07-15', status: 'skipped' }), '2025-07-15')).toBe(false);
  });

  it('mixed_review tasks appear exactly once in groupTasksBySection', () => {
    const tasks = [
      makeTask({ taskType: 'mixed_review', taskDate: '2025-07-15', status: 'pending' }),
    ];
    const sections = groupTasksBySection(tasks, '2025-07-15');
    const totalMixedReview = sections.reduce((sum, s) => sum + s.tasks.filter(t => t.taskType === 'mixed_review').length, 0);
    expect(totalMixedReview).toBe(1);
  });

  it('mixed_review as only remaining task does not produce ALL_DONE', () => {
    const displayTasks = [
      { id: '1', taskType: 'mixed_review', taskDate: '2026-07-23', status: 'pending', estimatedMinutes: 30, displayOrder: 0, completionPercentage: 0 },
    ];
    const sections = groupTasksBySection(displayTasks, '2026-07-23');
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks,
      sections,
    });
    expect(result.state).toBe('HAS_WORK');
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

  it('excludes flashcard_review tasks from calculations', () => {
    const tasks = [
      makeTask({ taskType: 'flashcard_review', status: 'pending', estimatedMinutes: 30 }),
      makeTask({ taskType: 'learning', status: 'completed', estimatedMinutes: 20 }),
    ];
    const result = calculateDayProgress(tasks, '2025-07-15');
    expect(result.totalTasks).toBe(1);
    expect(result.completedTasks).toBe(1);
    expect(result.totalMinutes).toBe(20);
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

describe('classifyTodayState', () => {
  it('returns PRE_START when todayKey < plan.startDate', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-24' },
      displayTasks: [{ taskDate: '2026-07-24', status: 'locked' }],
      sections: [],
    })
    expect(result.state).toBe('PRE_START')
    expect(result.startDate).toBe('2026-07-24')
  })

  it('PRE_START never shows ALL_DONE even with tasks', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-24' },
      displayTasks: [
        { taskDate: '2026-07-24', status: 'completed' },
        { taskDate: '2026-07-25', status: 'completed' },
      ],
      sections: [],
    })
    expect(result.state).toBe('PRE_START')
    expect(result.state).not.toBe('ALL_DONE')
  })

  it('returns ALL_DONE when today-relevant tasks exist but sections are empty', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks: [
        { taskDate: '2026-07-23', status: 'completed', taskType: 'learning' },
      ],
      sections: [],
    })
    expect(result.state).toBe('ALL_DONE')
  })

  it('ALL_DONE requires tasks relevant for today', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks: [
        { taskDate: '2026-07-24', status: 'locked', taskType: 'learning' },
      ],
      sections: [],
    })
    expect(result.state).toBe('EMPTY_TODAY')
    expect(result.state).not.toBe('ALL_DONE')
  })

  it('returns EMPTY_TODAY when plan is active but no tasks today', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks: [
        { taskDate: '2026-07-24', status: 'locked', taskType: 'learning' },
      ],
      sections: [],
    })
    expect(result.state).toBe('EMPTY_TODAY')
  })

  it('returns HAS_WORK when sections have tasks', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks: [
        { taskDate: '2026-07-23', status: 'pending', taskType: 'learning' },
      ],
      sections: [{ key: 'learn', label: 'Learn', tasks: [{ id: '1' }] }],
    })
    expect(result.state).toBe('HAS_WORK')
  })

  it('future completed tasks do not trigger ALL_DONE', () => {
    const result = classifyTodayState({
      todayKey: '2026-07-23',
      plan: { startDate: '2026-07-22' },
      displayTasks: [
        { taskDate: '2026-07-25', status: 'completed', taskType: 'learning' },
      ],
      sections: [],
    })
    expect(result.state).toBe('EMPTY_TODAY')
  })
})

describe('getTodayRelevantTasks', () => {
  it('includes tasks scheduled for today', () => {
    const tasks = [
      { taskDate: '2026-07-23', status: 'pending' },
      { taskDate: '2026-07-24', status: 'locked' },
    ]
    const result = getTodayRelevantTasks(tasks, '2026-07-23')
    expect(result).toHaveLength(1)
    expect(result[0].taskDate).toBe('2026-07-23')
  })

  it('includes in_progress tasks regardless of date', () => {
    const tasks = [
      { taskDate: '2026-07-25', status: 'in_progress' },
    ]
    const result = getTodayRelevantTasks(tasks, '2026-07-23')
    expect(result).toHaveLength(1)
  })

  it('includes overdue tasks (pending/locked before today)', () => {
    const tasks = [
      { taskDate: '2026-07-22', status: 'pending' },
      { taskDate: '2026-07-22', status: 'locked' },
    ]
    const result = getTodayRelevantTasks(tasks, '2026-07-23')
    expect(result).toHaveLength(2)
  })

  it('excludes future pending/locked tasks', () => {
    const tasks = [
      { taskDate: '2026-07-24', status: 'locked' },
      { taskDate: '2026-07-25', status: 'pending' },
    ]
    const result = getTodayRelevantTasks(tasks, '2026-07-23')
    expect(result).toHaveLength(0)
  })

  it('excludes completed tasks not scheduled for today', () => {
    const tasks = [
      { taskDate: '2026-07-22', status: 'completed' },
    ]
    const result = getTodayRelevantTasks(tasks, '2026-07-23')
    expect(result).toHaveLength(0)
  })
})

describe('groupTasksByDate', () => {
  const baseTask = {
    id: 'task-1',
    planTopicId: 'topic-1',
    taskDate: '2026-07-24',
    taskType: 'learning',
    status: 'pending',
    estimatedMinutes: 30,
    displayOrder: 0,
  }

  it('groups tasks by taskDate', () => {
    const tasks = [
      { ...baseTask, id: 't1', taskDate: '2026-07-24' },
      { ...baseTask, id: 't2', taskDate: '2026-07-24' },
      { ...baseTask, id: 't3', taskDate: '2026-07-25' },
    ]
    const result = groupTasksByDate(tasks)
    expect(result.get('2026-07-24')).toHaveLength(2)
    expect(result.get('2026-07-25')).toHaveLength(1)
  })

  it('sorts tasks within each day by displayOrder', () => {
    const tasks = [
      { ...baseTask, id: 't1', displayOrder: 3 },
      { ...baseTask, id: 't2', displayOrder: 1 },
      { ...baseTask, id: 't3', displayOrder: 2 },
    ]
    const result = groupTasksByDate(tasks)
    const dayTasks = result.get('2026-07-24')
    expect(dayTasks.map(t => t.id)).toEqual(['t2', 't3', 't1'])
  })

  it('skips tasks with no taskDate', () => {
    const tasks = [
      { ...baseTask, id: 't1', taskDate: '2026-07-24' },
      { ...baseTask, id: 't2', taskDate: null },
      { ...baseTask, id: 't3', taskDate: undefined },
    ]
    const result = groupTasksByDate(tasks)
    expect(result.get('2026-07-24')).toHaveLength(1)
  })

  it('returns empty map for empty input', () => {
    const result = groupTasksByDate([])
    expect(result.size).toBe(0)
  })

  it('preserves all task fields', () => {
    const task = { ...baseTask, id: 't1', customField: 'value' }
    const result = groupTasksByDate([task])
    expect(result.get('2026-07-24')[0]).toEqual(task)
  })
})

describe('claimActiveBlockSiblings', () => {
  function makeSections(tasks) {
    return groupTasksBySection(tasks, '2026-07-15')
  }

  it('claims pending siblings from Learn into Active when same studyBlockId has in_progress child', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: 'block-1', displayOrder: 0, completionPercentage: 0 },
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 8, studyBlockId: 'block-1', displayOrder: 1, completionPercentage: 0 },
      { id: 'C', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 10, studyBlockId: 'block-1', displayOrder: 2, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    const active = result.find(s => s.key === 'active')
    const learn = result.find(s => s.key === 'learn')

    expect(active).toBeDefined()
    expect(active.tasks.map(t => t.id)).toContain('A')
    expect(active.tasks.map(t => t.id)).toContain('B')
    expect(active.tasks.map(t => t.id)).toContain('C')
    expect(learn).toBeUndefined()
  })

  it('does not claim siblings from different studyBlockId', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: 'block-1', displayOrder: 0, completionPercentage: 0 },
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 8, studyBlockId: 'block-2', displayOrder: 1, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    const active = result.find(s => s.key === 'active')
    const learn = result.find(s => s.key === 'learn')

    expect(active.tasks.map(t => t.id)).toEqual(['A'])
    expect(learn.tasks.map(t => t.id)).toEqual(['B'])
  })

  it('returns sections unchanged when no active section exists', () => {
    const tasks = [
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 8, studyBlockId: 'block-1', displayOrder: 0, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    expect(result).toEqual(sections)
  })

  it('returns sections unchanged when no active tasks have studyBlockId', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: null, displayOrder: 0, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    expect(result).toEqual(sections)
  })

  it('sorts claimed tasks — in_progress first, then by displayOrder', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: 'block-1', displayOrder: 5, completionPercentage: 0 },
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 8, studyBlockId: 'block-1', displayOrder: 1, completionPercentage: 0 },
      { id: 'C', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 10, studyBlockId: 'block-1', displayOrder: 2, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    const active = result.find(s => s.key === 'active')
    expect(active.tasks.map(t => t.id)).toEqual(['A', 'B', 'C'])
  })

  it('claims overdue siblings too', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: 'block-1', displayOrder: 0, completionPercentage: 0 },
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-14', estimatedMinutes: 8, studyBlockId: 'block-1', displayOrder: 1, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    const active = result.find(s => s.key === 'active')
    const overdue = result.find(s => s.key === 'overdue')

    expect(active.tasks.map(t => t.id)).toContain('B')
    expect(overdue).toBeUndefined()
  })

  it('filters out empty sections after claiming', () => {
    const tasks = [
      { id: 'A', taskType: 'learning', status: 'in_progress', taskDate: '2026-07-15', estimatedMinutes: 5, studyBlockId: 'block-1', displayOrder: 0, completionPercentage: 0 },
      { id: 'B', taskType: 'learning', status: 'pending', taskDate: '2026-07-15', estimatedMinutes: 8, studyBlockId: 'block-1', displayOrder: 1, completionPercentage: 0 },
    ]
    const sections = makeSections(tasks)
    const result = claimActiveBlockSiblings(sections)
    expect(result.find(s => s.key === 'learn')).toBeUndefined()
  })
})

describe('classifyTodayReason', () => {
  const DEFAULT_WIZARD_AVAILABILITY = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    availableMinutes: weekday === 0 || weekday === 6 ? 0 : 120,
    isDayOff: weekday === 0 || weekday === 6,
  }))

  // Aug 8 2026 is a Saturday (weekday 6), a day-off under the default wizard availability.
  const defaultAvailabilityByWeekday = buildAvailabilityByWeekday(DEFAULT_WIZARD_AVAILABILITY)

  function saturdayAvailable(overrides = {}) {
    return buildAvailabilityByWeekday(DEFAULT_WIZARD_AVAILABILITY.map(entry =>
      entry.weekday === 6 ? { ...entry, availableMinutes: 60, isDayOff: false, ...overrides } : entry
    ))
  }

  it('A: draft plan beats a day-off/zero-minutes day', () => {
    const result = classifyTodayReason({
      planStatus: 'draft',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', defaultAvailabilityByWeekday),
      availabilityByWeekday: defaultAvailabilityByWeekday,
      tasksToday: [],
      nextTask: null,
    })
    expect(result.reason).toBe('DRAFT')
    expect(result.title).toBe("This rotation starts today, but it isn't active yet.")
  })

  it('A: draft beats availability even when tasks exist', () => {
    const result = classifyTodayReason({
      planStatus: 'draft',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', saturdayAvailable()),
      availabilityByWeekday: saturdayAvailable(),
      tasksToday: [{ id: 't1', status: 'pending' }],
      nextTask: null,
    })
    expect(result.reason).toBe('DRAFT')
  })

  it('B: Saturday Aug 8 2026 day-off yields next study day Monday, Aug 10 2026', () => {
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', defaultAvailabilityByWeekday),
      availabilityByWeekday: defaultAvailabilityByWeekday,
      tasksToday: [],
      nextTask: null,
      endDate: '2026-09-30',
    })
    expect(result.reason).toBe('DAY_OFF')
    expect(result.title).toBe('No study time is scheduled for today.')
    expect(result.nextStudyDayKey).toBe('2026-08-10')
    expect(result.nextStudyDayLabel).toBe('Monday, Aug 10 2026')
  })

  it('B: zero available minutes counts as unavailable', () => {
    const zeroMin = saturdayAvailable({ availableMinutes: 0, isDayOff: false })
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', zeroMin),
      availabilityByWeekday: zeroMin,
      tasksToday: [],
      nextTask: null,
      endDate: '2026-09-30',
    })
    expect(result.reason).toBe('DAY_OFF')
  })

  it('B: omits the next study day line when no eligible day remains in the plan range', () => {
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', defaultAvailabilityByWeekday),
      availabilityByWeekday: defaultAvailabilityByWeekday,
      tasksToday: [],
      nextTask: null,
      endDate: '2026-08-09',
    })
    expect(result.reason).toBe('DAY_OFF')
    expect(result.nextStudyDayKey).toBeNull()
    expect(result.nextStudyDayLabel).toBeNull()
  })

  it('B: skips blocked dates when looking for the next study day', () => {
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', defaultAvailabilityByWeekday),
      availabilityByWeekday: defaultAvailabilityByWeekday,
      tasksToday: [],
      nextTask: null,
      blockedDates: ['2026-08-10', '2026-08-11', '2026-08-12'],
      endDate: '2026-09-30',
    })
    expect(result.nextStudyDayKey).toBe('2026-08-13')
  })

  it('C: all of today\'s tasks completed → ALL_DONE with recap', () => {
    const availableSat = saturdayAvailable()
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', availableSat),
      availabilityByWeekday: availableSat,
      tasksToday: [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'partial' },
        { id: 't3', status: 'skipped' },
      ],
      nextTask: null,
    })
    expect(result.reason).toBe('ALL_DONE')
    expect(result.title).toBe("You're done for today.")
    expect(result.doneCount).toBe(1)
  })

  it('D: all of today\'s tasks locked behind prerequisites → LOCKED with readable prereq names', () => {
    const availableSat = saturdayAvailable()
    const topicsById = new Map([
      ['topic-1', { canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure' }],
      ['topic-2', { canonicalTopicId: 'topic-2', topicTitle: 'Renal' }],
    ])
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', availableSat),
      availabilityByWeekday: availableSat,
      tasksToday: [
        { id: 't1', status: 'locked', unlockCondition: 'learning_completed:topic-1' },
        { id: 't2', status: 'locked', unlockCondition: 'uworld_completed:topic-2' },
      ],
      nextTask: null,
      topicsById,
    })
    expect(result.reason).toBe('LOCKED')
    expect(result.prereqNames).toContain('Heart Failure')
    expect(result.prereqNames).toContain('Renal')
  })

  it('D: falls back to the condition key when a prereq title is unknown', () => {
    const availableSat = saturdayAvailable()
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', availableSat),
      availabilityByWeekday: availableSat,
      tasksToday: [
        { id: 't1', status: 'locked', unlockCondition: 'learning_completed:missing-topic' },
      ],
      nextTask: null,
      topicsById: new Map(),
    })
    expect(result.reason).toBe('LOCKED')
    expect(result.prereqNames).toEqual(['missing-topic'])
  })

  it('E: nothing today but a future task exists → NEXT_TASK with Next task line', () => {
    const availableSat = saturdayAvailable()
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', availableSat),
      availabilityByWeekday: availableSat,
      tasksToday: [],
      nextTask: { title: 'Cardiology Lecture', dateKey: '2026-08-10', dateLabel: 'Monday, Aug 10 2026' },
    })
    expect(result.reason).toBe('NEXT_TASK')
    expect(result.title).toBe('Nothing is scheduled for today.')
    expect(result.nextTask.title).toBe('Cardiology Lecture')
    expect(result.nextTask.dateLabel).toBe('Monday, Aug 10 2026')
  })

  it('F: truly nothing in the plan → NONE generic message', () => {
    const availableSat = saturdayAvailable()
    const result = classifyTodayReason({
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', availableSat),
      availabilityByWeekday: availableSat,
      tasksToday: [],
      nextTask: null,
    })
    expect(result.reason).toBe('NONE')
    expect(result.title).toBe('Nothing scheduled for today')
  })

  it('timezone: a plan timezone different from the browser does not shift the day-off classification', () => {
    const base = {
      planStatus: 'active',
      todayKey: '2026-08-08',
      dayAvailability: getDayAvailabilityEntry('2026-08-08', defaultAvailabilityByWeekday),
      availabilityByWeekday: defaultAvailabilityByWeekday,
      tasksToday: [],
      nextTask: null,
      endDate: '2026-09-30',
    }
    const browserResult = classifyTodayReason(base)
    const nairobiResult = classifyTodayReason({ ...base, planTimezone: 'Africa/Nairobi' })
    expect(nairobiResult).toEqual(browserResult)
    expect(nairobiResult.reason).toBe('DAY_OFF')
    expect(nairobiResult.nextStudyDayKey).toBe('2026-08-10')
    expect(nairobiResult.nextStudyDayLabel).toBe('Monday, Aug 10 2026')
  })
})

describe('findNextFutureTask', () => {
  it('picks the earliest future non-terminal task and formats its date', () => {
    const tasks = [
      { id: 't1', taskType: 'learning', status: 'locked', taskDate: '2026-08-11', topicTitle: 'Renal' },
      { id: 't2', taskType: 'learning', status: 'pending', taskDate: '2026-08-10', topicTitle: 'Heart Failure', displayOrder: 1 },
      { id: 't3', taskType: 'learning', status: 'completed', taskDate: '2026-08-09', topicTitle: 'Already Done' },
    ]
    const result = findNextFutureTask(tasks, '2026-08-08')
    expect(result.title).toBe('Heart Failure')
    expect(result.dateKey).toBe('2026-08-10')
    expect(result.dateLabel).toBe('Monday, Aug 10 2026')
  })

  it('returns null when every future task is terminal', () => {
    const tasks = [
      { id: 't1', status: 'completed', taskDate: '2026-08-10' },
      { id: 't2', status: 'skipped', taskDate: '2026-08-11' },
    ]
    expect(findNextFutureTask(tasks, '2026-08-08')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(findNextFutureTask([], '2026-08-08')).toBeNull()
  })
})

describe('findNextStudyDay / availability helpers', () => {
  const avail = buildAvailabilityByWeekday([
    { weekday: 0, availableMinutes: 0, isDayOff: true },
    { weekday: 1, availableMinutes: 120, isDayOff: false },
    { weekday: 2, availableMinutes: 120, isDayOff: false },
    { weekday: 3, availableMinutes: 120, isDayOff: false },
    { weekday: 4, availableMinutes: 120, isDayOff: false },
    { weekday: 5, availableMinutes: 120, isDayOff: false },
    { weekday: 6, availableMinutes: 0, isDayOff: true },
  ])

  it('getDayAvailabilityEntry resolves by weekday of the date key', () => {
    expect(getDayAvailabilityEntry('2026-08-08', avail)).toEqual({ weekday: 6, availableMinutes: 0, isDayOff: true })
    expect(getDayAvailabilityEntry('2026-08-10', avail)).toEqual({ weekday: 1, availableMinutes: 120, isDayOff: false })
  })

  it('getDayAvailabilityEntry returns null when no availability map is provided', () => {
    expect(getDayAvailabilityEntry('2026-08-08', null)).toBeNull()
    expect(getDayAvailabilityEntry('2026-08-08', new Map())).toBeNull()
  })

  it('findNextStudyDay returns the next eligible day strictly after today', () => {
    expect(findNextStudyDay({ todayKey: '2026-08-08', availabilityByWeekday: avail })).toBe('2026-08-10')
    expect(findNextStudyDay({ todayKey: '2026-08-14', availabilityByWeekday: avail })).toBe('2026-08-17')
  })

  it('findNextStudyDay returns null without availability data', () => {
    expect(findNextStudyDay({ todayKey: '2026-08-08', availabilityByWeekday: new Map() })).toBeNull()
  })

  it('getPrerequisiteName resolves readable topic titles from canonical ids', () => {
    const topicsById = new Map([['topic-1', { canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure' }]])
    expect(getPrerequisiteName({ unlockCondition: 'learning_completed:topic-1' }, topicsById)).toBe('Heart Failure')
    expect(getPrerequisiteName({ unlockCondition: 'learning_completed:missing' }, topicsById)).toBe('missing')
    expect(getPrerequisiteName({ unlockCondition: null }, topicsById)).toBeNull()
  })
})
