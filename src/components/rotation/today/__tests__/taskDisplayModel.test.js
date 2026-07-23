import { describe, it, expect } from 'vitest';
import {
  STATUS_LABELS,
  formatMinutes,
  formatProgress,
  getTaskDisplayModel,
} from '../taskDisplayModel';

function makeTask(overrides = {}) {
  return {
    id: 't1',
    planId: 'p1',
    planTopicId: 'pt1',
    taskDate: '2025-07-15',
    taskType: 'learning',
    status: 'pending',
    displayOrder: 1,
    estimatedMinutes: 30,
    actualMinutes: 0,
    targetCount: null,
    completedCount: 0,
    completionPercentage: 0,
    incorrectCount: 0,
    provider: 'internal',
    mode: 'study',
    metadataJson: null,
    ...overrides,
  };
}

describe('STATUS_LABELS', () => {
  it('maps all statuses to human-readable labels', () => {
    expect(STATUS_LABELS.locked).toBe('Locked');
    expect(STATUS_LABELS.pending).toBe('Pending');
    expect(STATUS_LABELS.in_progress).toBe('In Progress');
    expect(STATUS_LABELS.partial).toBe('Partial');
    expect(STATUS_LABELS.completed).toBe('Completed');
    expect(STATUS_LABELS.skipped).toBe('Skipped');
  });
});

describe('formatMinutes', () => {
  it('returns "0m" for 0 or falsy', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(null)).toBe('0m');
    expect(formatMinutes(undefined)).toBe('0m');
  });

  it('formats minutes only', () => {
    expect(formatMinutes(30)).toBe('30m');
    expect(formatMinutes(1)).toBe('1m');
    expect(formatMinutes(59)).toBe('59m');
  });

  it('formats hours only', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(120)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(61)).toBe('1h 1m');
    expect(formatMinutes(150)).toBe('2h 30m');
  });
});

describe('formatProgress', () => {
  it('formats count-based tasks', () => {
    const task = makeTask({ targetCount: 5, completedCount: 3 });
    const result = formatProgress(task);
    expect(result.percent).toBe(60);
    expect(result.label).toBe('3/5 questions');
  });

  it('formats percentage-based tasks', () => {
    const task = makeTask({ targetCount: null, completionPercentage: 75 });
    const result = formatProgress(task);
    expect(result.percent).toBe(75);
    expect(result.label).toBe('75%');
  });

  it('returns "Not started" when no target', () => {
    const task = makeTask({ targetCount: null, completionPercentage: 0 });
    const result = formatProgress(task);
    expect(result.percent).toBe(0);
    expect(result.label).toBe('Not started');
  });

  it('handles zero completed count', () => {
    const task = makeTask({ targetCount: 10, completedCount: 0 });
    const result = formatProgress(task);
    expect(result.percent).toBe(0);
    expect(result.label).toBe('0/10 questions');
  });

  it('handles full completion', () => {
    const task = makeTask({ targetCount: 5, completedCount: 5 });
    const result = formatProgress(task);
    expect(result.percent).toBe(100);
    expect(result.label).toBe('5/5 questions');
  });
});

describe('getTaskDisplayModel', () => {
  it('copies raw fields through', () => {
    const task = makeTask();
    const model = getTaskDisplayModel(task);
    expect(model.id).toBe('t1');
    expect(model.planId).toBe('p1');
    expect(model.planTopicId).toBe('pt1');
    expect(model.taskDate).toBe('2025-07-15');
    expect(model.taskType).toBe('learning');
    expect(model.status).toBe('pending');
    expect(model.displayOrder).toBe(1);
    expect(model.provider).toBe('internal');
    expect(model.mode).toBe('study');
    expect(model.metadataJson).toBeNull();
  });

  it('sets statusLabel from STATUS_LABELS', () => {
    expect(getTaskDisplayModel(makeTask({ status: 'in_progress' })).statusLabel).toBe('In Progress');
    expect(getTaskDisplayModel(makeTask({ status: 'locked' })).statusLabel).toBe('Locked');
    expect(getTaskDisplayModel(makeTask({ status: 'completed' })).statusLabel).toBe('Completed');
  });

  it('falls back to raw status for unknown status', () => {
    const model = getTaskDisplayModel(makeTask({ status: 'unknown' }));
    expect(model.statusLabel).toBe('unknown');
  });

  it('sets typeLabel from TASK_TYPE_LABELS', () => {
    expect(getTaskDisplayModel(makeTask({ taskType: 'learning' })).typeLabel).toBe('Learning');
    expect(getTaskDisplayModel(makeTask({ taskType: 'questions' })).typeLabel).toBe('Questions');
  });

  it('formats timeEstimate and timeActual', () => {
    const model = getTaskDisplayModel(makeTask({ estimatedMinutes: 90, actualMinutes: 45 }));
    expect(model.timeEstimate).toBe('1h 30m');
    expect(model.timeActual).toBe('45m');
  });

  it('returns empty string for timeActual when 0', () => {
    const model = getTaskDisplayModel(makeTask({ actualMinutes: 0 }));
    expect(model.timeActual).toBe('');
  });

  it('computes progress fields', () => {
    const model = getTaskDisplayModel(makeTask({ targetCount: 10, completedCount: 4 }));
    expect(model.progressPercent).toBe(40);
    expect(model.progressLabel).toBe('4/10 questions');
  });

  it('sets boolean flags correctly for pending status', () => {
    const model = getTaskDisplayModel(makeTask({ status: 'pending' }));
    expect(model.isLocked).toBe(false);
    expect(model.isActive).toBe(false);
    expect(model.isCompleted).toBe(false);
    expect(model.isTerminal).toBe(false);
  });

  it('sets boolean flags correctly for in_progress status', () => {
    const model = getTaskDisplayModel(makeTask({ status: 'in_progress' }));
    expect(model.isLocked).toBe(false);
    expect(model.isActive).toBe(true);
    expect(model.isCompleted).toBe(false);
    expect(model.isTerminal).toBe(false);
  });

  it('sets boolean flags correctly for completed status', () => {
    const model = getTaskDisplayModel(makeTask({ status: 'completed' }));
    expect(model.isLocked).toBe(false);
    expect(model.isActive).toBe(false);
    expect(model.isCompleted).toBe(true);
    expect(model.isTerminal).toBe(true);
  });

  it('sets isTerminal for partial and skipped', () => {
    expect(getTaskDisplayModel(makeTask({ status: 'partial' })).isTerminal).toBe(true);
    expect(getTaskDisplayModel(makeTask({ status: 'skipped' })).isTerminal).toBe(true);
  });

  it('sets isLocked for locked status', () => {
    expect(getTaskDisplayModel(makeTask({ status: 'locked' })).isLocked).toBe(true);
  });

  it('defaults estimatedMinutes and actualMinutes to 0', () => {
    const model = getTaskDisplayModel(makeTask({ estimatedMinutes: null, actualMinutes: null }));
    expect(model.estimatedMinutes).toBe(0);
    expect(model.actualMinutes).toBe(0);
    expect(model.timeEstimate).toBe('0m');
    expect(model.timeActual).toBe('');
  });

  describe('isOverdue', () => {
    it('returns true when taskDate is before todayKey and status is not terminal', () => {
      const model = getTaskDisplayModel(
        makeTask({ taskDate: '2025-07-10', status: 'pending' }),
        '2025-07-15',
      );
      expect(model.isOverdue).toBe(true);
    });

    it('returns false when taskDate equals todayKey', () => {
      const model = getTaskDisplayModel(
        makeTask({ taskDate: '2025-07-15', status: 'pending' }),
        '2025-07-15',
      );
      expect(model.isOverdue).toBe(false);
    });

    it('returns false when taskDate is after todayKey', () => {
      const model = getTaskDisplayModel(
        makeTask({ taskDate: '2025-07-20', status: 'pending' }),
        '2025-07-15',
      );
      expect(model.isOverdue).toBe(false);
    });

    it('returns false for terminal statuses even if past due', () => {
      const model = getTaskDisplayModel(
        makeTask({ taskDate: '2025-07-10', status: 'completed' }),
        '2025-07-15',
      );
      expect(model.isOverdue).toBe(false);
    });

    it('returns false when todayKey is not provided', () => {
      const model = getTaskDisplayModel(
        makeTask({ taskDate: '2025-07-10', status: 'pending' }),
      );
      expect(model.isOverdue).toBe(false);
    });
  });
});
