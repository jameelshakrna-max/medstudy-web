import { describe, it, expect } from 'vitest';
import getTaskLockState from '../getTaskLockState';

const FALLBACK_MESSAGE = "Complete this task's prerequisite first.";

const UNLOCKED = { isLocked: false, conditionType: null, prerequisiteTopic: null, message: null };

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    planId: 'plan-1',
    planTopicId: 'topic-1',
    taskType: 'uworld_questions',
    status: 'pending',
    ...overrides,
  };
}

function makeTopic(overrides = {}) {
  return {
    id: 'topic-1',
    planId: 'plan-1',
    canonicalTopicId: 'topic-1',
    topicTitle: 'Heart Failure',
    status: 'learning',
    totalUworldQuestions: 0,
    completedUworldQuestions: 0,
    ...overrides,
  };
}

function makeTopics(...topics) {
  return new Map(topics.map(t => [t.id, t]));
}

describe('getTaskLockState', () => {
  it('returns unlocked when there is no unlockCondition', () => {
    expect(getTaskLockState(makeTask(), makeTopics())).toEqual(UNLOCKED);
    expect(getTaskLockState(makeTask({ unlockCondition: null }), makeTopics())).toEqual(UNLOCKED);
    expect(getTaskLockState(makeTask({ unlockCondition: '' }), makeTopics())).toEqual(UNLOCKED);
  });

  it('reads snake_case unlock_condition', () => {
    const result = getTaskLockState(
      makeTask({ unlock_condition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic())
    );
    expect(result.isLocked).toBe(true);
  });

  it('learning_completed is locked when topic status is not_started', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'not_started' }))
    );
    expect(result.isLocked).toBe(true);
    expect(result.conditionType).toBe('learning_completed');
    expect(result.prerequisiteTopic).toEqual({ canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure' });
  });

  it('learning_completed is locked when topic status is learning', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'learning' }))
    );
    expect(result.isLocked).toBe(true);
    expect(result.message).toBe('Complete learning for Heart Failure to unlock these questions.');
  });

  it('learning_completed is unlocked when topic status is uworld_in_progress', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'uworld_in_progress' }))
    );
    expect(result).toEqual(UNLOCKED);
  });

  it('learning_completed is unlocked when topic status is completed', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'completed' }))
    );
    expect(result).toEqual(UNLOCKED);
  });

  it('learning_completed is unlocked when topic status is legacy questions_locked', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'questions_locked' }))
    );
    expect(result).toEqual(UNLOCKED);
  });

  it('learning_completed fails closed when topic has no status', () => {
    const topic = makeTopic();
    delete topic.status;
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(topic)
    );
    expect(result.isLocked).toBe(true);
  });

  it('learning_completed fails closed when prerequisite topic is not in the map', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-missing' }),
      makeTopics()
    );
    expect(result.isLocked).toBe(true);
    expect(result.conditionType).toBe('learning_completed');
    expect(result.prerequisiteTopic).toBeNull();
    expect(result.message).toBe(FALLBACK_MESSAGE);
  });

  it('uworld_completed is locked when completed is less than total', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'uworld_in_progress', totalUworldQuestions: 40, completedUworldQuestions: 10 }))
    );
    expect(result.isLocked).toBe(true);
    expect(result.message).toBe('Complete the UWorld questions for Heart Failure to unlock this task.');
  });

  it('uworld_completed is unlocked when completed equals total', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'uworld_in_progress', totalUworldQuestions: 40, completedUworldQuestions: 40 }))
    );
    expect(result).toEqual(UNLOCKED);
  });

  it('uworld_completed is unlocked when completed exceeds total', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(makeTopic({ totalUworldQuestions: 40, completedUworldQuestions: 45 }))
    );
    expect(result).toEqual(UNLOCKED);
  });

  it('uworld_completed fails closed when total is missing or zero', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(makeTopic({ status: 'uworld_in_progress' }))
    );
    expect(result.isLocked).toBe(true);

    const zeroTotal = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(makeTopic({ totalUworldQuestions: 0, completedUworldQuestions: 0 }))
    );
    expect(zeroTotal.isLocked).toBe(true);
  });

  it('uworld_completed fails closed when completed is missing', () => {
    const topic = makeTopic({ status: 'uworld_in_progress', totalUworldQuestions: 40 });
    delete topic.completedUworldQuestions;
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-1' }),
      makeTopics(topic)
    );
    expect(result.isLocked).toBe(true);
  });

  it('malformed conditions fail closed with generic message', () => {
    const cases = ['no-colon', 'learning_completed:', ':', 'weird_type:abc'];
    for (const condition of cases) {
      const result = getTaskLockState(makeTask({ unlockCondition: condition }), makeTopics());
      expect(result.isLocked).toBe(true);
      expect(result.message).toBe(FALLBACK_MESSAGE);
      for (const token of condition.split(':').filter(Boolean)) {
        expect(result.message).not.toContain(token);
      }
    }
  });

  it('unknown condition type fails closed with generic message even when topic found', () => {
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'weird_type:topic-1' }),
      makeTopics(makeTopic())
    );
    expect(result.isLocked).toBe(true);
    expect(result.conditionType).toBe('weird_type');
    expect(result.prerequisiteTopic).toEqual({ canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure' });
    expect(result.message).toBe(FALLBACK_MESSAGE);
    expect(result.message).not.toContain('weird_type');
    expect(result.message).not.toContain('topic-1');
  });

  it('does not throw for null task or missing topicsById', () => {
    expect(() => getTaskLockState(null, null)).not.toThrow();
    expect(getTaskLockState(null, undefined)).toEqual(UNLOCKED);
    expect(getTaskLockState(undefined, new Map())).toEqual(UNLOCKED);
    expect(getTaskLockState({}, undefined)).toEqual(UNLOCKED);
  });

  it('does not throw for empty map or plain-object topicsById', () => {
    const locked = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      new Map()
    );
    expect(locked.isLocked).toBe(true);

    const plain = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      { 'topic-1': makeTopic() }
    );
    expect(plain.isLocked).toBe(true);
  });

  it('messages contain topicTitle and never leak canonicalTopicId', () => {
    const learningResult = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-123' }),
      makeTopics(makeTopic({ id: 'topic-9', canonicalTopicId: 'topic-123', status: 'not_started' }))
    );
    expect(learningResult.message).toContain('Heart Failure');
    expect(learningResult.message).not.toContain('topic-123');
    expect(learningResult.message).not.toContain('heart-failure');

    const uworldResult = getTaskLockState(
      makeTask({ unlockCondition: 'uworld_completed:topic-123' }),
      makeTopics(makeTopic({ id: 'topic-9', canonicalTopicId: 'topic-123', status: 'uworld_in_progress', totalUworldQuestions: 40, completedUworldQuestions: 0 }))
    );
    expect(uworldResult.message).toContain('Heart Failure');
    expect(uworldResult.message).not.toContain('topic-123');
  });

  it('uses fallback message when prerequisite topic has no title', () => {
    const topic = makeTopic({ canonicalTopicId: 'topic-1', status: 'not_started' });
    delete topic.topicTitle;
    const result = getTaskLockState(
      makeTask({ unlockCondition: 'learning_completed:topic-1' }),
      makeTopics(topic)
    );
    expect(result.message).toBe(FALLBACK_MESSAGE);
    expect(result.message).not.toContain('undefined');
  });

  it('matches prerequisite topic by canonicalTopicId regardless of planTopicId', () => {
    const result = getTaskLockState(
      makeTask({ planTopicId: 'other-plan-topic', unlockCondition: 'learning_completed:topic-77' }),
      makeTopics(makeTopic({ id: 'unrelated', canonicalTopicId: 'topic-77', status: 'completed' }))
    );
    expect(result).toEqual(UNLOCKED);
  });
});
