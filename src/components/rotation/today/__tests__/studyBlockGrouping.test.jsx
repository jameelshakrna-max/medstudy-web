import { describe, it, expect, vi } from 'vitest';
import { groupTasksIntoStudyBlocks } from '../studyBlockGrouping';

vi.mock('../taskActionRules', () => ({
  getAvailableTaskActions: vi.fn((task) => {
    if (task.status === 'pending') return ['start', 'complete', 'partial', 'skip'];
    if (task.status === 'in_progress') return ['complete', 'partial', 'record_time'];
    return [];
  }),
}));

function makeTask(overrides) {
  return {
    id: 'task-1',
    planTopicId: 'topic-1',
    taskType: 'learning',
    status: 'pending',
    estimatedMinutes: 30,
    completionPercentage: 0,
    displayOrder: 0,
    topicTitle: 'Cardiology',
    topicSection: 'Cardiology',
    studyBlockId: null,
    ...overrides,
  };
}

describe('groupTasksIntoStudyBlocks', () => {
  describe('grouping rules', () => {
    it('1: two tasks with same studyBlockId → study_block entry', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('study_block');
      expect(result[0].studyBlockId).toBe('sb-1');
      expect(result[0].tasks).toHaveLength(2);
    });

    it('2: singleton studyBlockId → task entry', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1' }),
        makeTask({ id: 'b', studyBlockId: 'sb-2' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('task');
      expect(result[0].task.id).toBe('a');
      expect(result[1].type).toBe('task');
      expect(result[1].task.id).toBe('b');
    });

    it('3: null studyBlockId → task entry', () => {
      const tasks = [makeTask({ id: 'a', studyBlockId: null })];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('task');
    });

    it('4: different IDs → separate entries', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1' }),
        makeTask({ id: 'c', studyBlockId: 'sb-2' }),
        makeTask({ id: 'd', studyBlockId: 'sb-2' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('study_block');
      expect(result[0].studyBlockId).toBe('sb-1');
      expect(result[1].type).toBe('study_block');
      expect(result[1].studyBlockId).toBe('sb-2');
    });

    it('5: non-learning tasks are never grouped', () => {
      const tasks = [
        makeTask({ id: 'a', taskType: 'uworld_questions', studyBlockId: 'sb-1' }),
        makeTask({ id: 'b', taskType: 'uworld_questions', studyBlockId: 'sb-1' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('task');
      expect(result[1].type).toBe('task');
    });

    it('6: child order preserved in original task order', () => {
      const tasks = [
        makeTask({ id: 'c', studyBlockId: 'sb-1', displayOrder: 3 }),
        makeTask({ id: 'a', studyBlockId: 'sb-1', displayOrder: 1 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', displayOrder: 2 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(1);
      expect(result[0].tasks.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    });

    it('7: total estimated minutes equals sum of children', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', estimatedMinutes: 20 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', estimatedMinutes: 45 }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', estimatedMinutes: 10 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].totalEstimatedMinutes).toBe(75);
    });

    it('8: works on one section only — does not cross-section merge', () => {
      const sectionA = [
        makeTask({ id: 'a1', studyBlockId: 'sb-1', displayOrder: 0 }),
        makeTask({ id: 'a2', studyBlockId: 'sb-1', displayOrder: 1 }),
      ];
      const sectionB = [
        makeTask({ id: 'b1', studyBlockId: 'sb-1', displayOrder: 0 }),
        makeTask({ id: 'b2', studyBlockId: 'sb-1', displayOrder: 1 }),
      ];
      const resultA = groupTasksIntoStudyBlocks(sectionA, {});
      const resultB = groupTasksIntoStudyBlocks(sectionB, {});
      expect(resultA).toHaveLength(1);
      expect(resultA[0].type).toBe('study_block');
      expect(resultA[0].tasks.map((t) => t.id)).toEqual(['a1', 'a2']);
      expect(resultB).toHaveLength(1);
      expect(resultB[0].tasks.map((t) => t.id)).toEqual(['b1', 'b2']);
    });
  });

  describe('progress calculation', () => {
    it('9: completed weighted as 100%', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', estimatedMinutes: 30 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 30 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].progress.percent).toBe(50);
      expect(result[0].progress.completed).toBe(1);
    });

    it('10: partial uses completionPercentage', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'partial', completionPercentage: 60, estimatedMinutes: 30 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 30 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].progress.percent).toBe(30);
      expect(result[0].progress.partial).toBe(1);
    });

    it('11: actualMinutes is ignored — uses estimatedMinutes only', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', estimatedMinutes: 20, actualMinutes: 60 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 20, actualMinutes: 0 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].totalEstimatedMinutes).toBe(40);
      expect(result[0].progress.percent).toBe(50);
    });

    it('12: skipped contributes 0 to progress', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', estimatedMinutes: 20 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'skipped', estimatedMinutes: 20 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].progress.percent).toBe(50);
    });

    it('13: skipped count surfaced in progress counts', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'skipped', estimatedMinutes: 10 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'skipped', estimatedMinutes: 10 }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 10 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].progress.skipped).toBe(2);
      expect(result[0].progress.remaining).toBe(1);
    });

    it('14: in_progress with no percentage contributes 0', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'in_progress', completionPercentage: 0, estimatedMinutes: 30 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 30 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].progress.percent).toBe(0);
    });

    it('15: mixed weighted progress is correct', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', estimatedMinutes: 20 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'partial', completionPercentage: 50, estimatedMinutes: 20 }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', status: 'in_progress', completionPercentage: 25, estimatedMinutes: 20 }),
        makeTask({ id: 'd', studyBlockId: 'sb-1', status: 'pending', estimatedMinutes: 20 }),
        makeTask({ id: 'e', studyBlockId: 'sb-1', status: 'skipped', estimatedMinutes: 20 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      // 20*1 + 20*0.5 + 20*0.25 + 20*0 + 20*0 = 20 + 10 + 5 + 0 + 0 = 35
      // total weight = 100
      expect(result[0].progress.percent).toBe(35);
      expect(result[0].progress.completed).toBe(1);
      expect(result[0].progress.partial).toBe(1);
      expect(result[0].progress.inProgress).toBe(1);
      expect(result[0].progress.skipped).toBe(1);
      expect(result[0].progress.remaining).toBe(1);
    });
  });

  describe('primary task selection', () => {
    it('16: in_progress child wins as primary', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'pending', displayOrder: 0 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'in_progress', displayOrder: 1 }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', status: 'pending', displayOrder: 2 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].primaryTask.id).toBe('b');
    });

    it('17: otherwise earliest startable pending child', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', displayOrder: 0 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', displayOrder: 1 }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', status: 'pending', displayOrder: 2 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].primaryTask.id).toBe('b');
    });

    it('18: skipped not selected as primary', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'skipped', displayOrder: 0 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'pending', displayOrder: 1 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].primaryTask.id).toBe('b');
    });

    it('19: completed not selected as primary', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', displayOrder: 0 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'completed', displayOrder: 1 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].primaryTask).toBeNull();
    });

    it('20: no actionable child → null', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', status: 'completed', displayOrder: 0 }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', status: 'skipped', displayOrder: 1 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].primaryTask).toBeNull();
    });
  });

  describe('title and topic preview', () => {
    it('21: shared topicSection → "Section Study Block"', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', topicSection: 'Abdominal Trauma' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', topicSection: 'Abdominal Trauma' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].title).toBe('Abdominal Trauma Study Block');
    });

    it('21b: mixed topicSections → "Study Block"', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', topicSection: 'Cardiology' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', topicSection: 'Pulmonology' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].title).toBe('Study Block');
    });

    it('22: topic preview uses topicTitle', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', topicTitle: 'Heart Failure' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', topicTitle: 'Valve Disease' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].topicNames).toEqual(['Heart Failure', 'Valve Disease']);
      expect(result[0].topicCount).toBe(2);
    });

    it('23: hasMoreTopics when >3 topics', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', topicTitle: 'A' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', topicTitle: 'B' }),
        makeTask({ id: 'c', studyBlockId: 'sb-1', topicTitle: 'C' }),
        makeTask({ id: 'd', studyBlockId: 'sb-1', topicTitle: 'D' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].topicNames).toEqual(['A', 'B', 'C']);
      expect(result[0].hasMoreTopics).toBe(true);
      expect(result[0].topicCount).toBe(4);
    });

    it('23b: hasMoreTopics false when ≤3 topics', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-1', topicTitle: 'A' }),
        makeTask({ id: 'b', studyBlockId: 'sb-1', topicTitle: 'B' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].hasMoreTopics).toBe(false);
      expect(result[0].topicCount).toBe(2);
    });

    it('24: no technical IDs exposed in title', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: 'sb-internal-xyz', topicSection: 'Renal' }),
        makeTask({ id: 'b', studyBlockId: 'sb-internal-xyz', topicSection: 'Renal' }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result[0].title).not.toContain('sb-internal');
      expect(result[0].title).toBe('Renal Study Block');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(groupTasksIntoStudyBlocks([], {})).toEqual([]);
    });

    it('preserves original order with mixed task and block entries', () => {
      const tasks = [
        makeTask({ id: 'solo', studyBlockId: null, displayOrder: 0 }),
        makeTask({ id: 'b1', studyBlockId: 'sb-1', displayOrder: 1 }),
        makeTask({ id: 'b2', studyBlockId: 'sb-1', displayOrder: 2 }),
        makeTask({ id: 'after', studyBlockId: null, displayOrder: 3 }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result.map((e) => e.type)).toEqual(['task', 'study_block', 'task']);
      expect(result[0].task.id).toBe('solo');
      expect(result[1].tasks.map((t) => t.id)).toEqual(['b1', 'b2']);
      expect(result[2].task.id).toBe('after');
    });

    it('undefined studyBlockId treated same as null', () => {
      const tasks = [
        makeTask({ id: 'a', studyBlockId: undefined }),
        makeTask({ id: 'b', studyBlockId: undefined }),
      ];
      const result = groupTasksIntoStudyBlocks(tasks, {});
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('task');
      expect(result[1].type).toBe('task');
    });
  });
});
