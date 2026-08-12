// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  resolveTopicStatus,
  aggregateStatus,
  statusLabel,
  statusTone,
  TOPIC_STATUS,
} from '../curriculumStatus.js'

describe('resolveTopicStatus', () => {
  it('maps the real string completion values', () => {
    expect(resolveTopicStatus({ status: 'Not Started' })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus({ status: 'In Progress' })).toBe(TOPIC_STATUS.in_progress)
    expect(resolveTopicStatus({ status: 'Reviewing' })).toBe(TOPIC_STATUS.reviewing)
    expect(resolveTopicStatus({ status: 'Complete' })).toBe(TOPIC_STATUS.complete)
  })

  it('falls back to completion_pct when status is missing', () => {
    expect(resolveTopicStatus({ completion_pct: 100 })).toBe(TOPIC_STATUS.complete)
    expect(resolveTopicStatus({ completion_pct: 50 })).toBe(TOPIC_STATUS.in_progress)
    expect(resolveTopicStatus({ completion_pct: 0 })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus({ completion_pct: null })).toBe(TOPIC_STATUS.not_started)
  })

  it('tolerates numeric status values', () => {
    expect(resolveTopicStatus({ status: 0 })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus({ status: 1 })).toBe(TOPIC_STATUS.in_progress)
    expect(resolveTopicStatus({ status: 2 })).toBe(TOPIC_STATUS.complete)
    expect(resolveTopicStatus({ status: 3 })).toBe(TOPIC_STATUS.reviewing)
    expect(resolveTopicStatus({ status: 9 })).toBe(TOPIC_STATUS.not_started)
  })

  it('treats unknown status values as not_started', () => {
    expect(resolveTopicStatus({ status: 'Archived' })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus({ status: '' })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus({ status: undefined, completion_pct: undefined })).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus(null)).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus(undefined)).toBe(TOPIC_STATUS.not_started)
    expect(resolveTopicStatus('nope')).toBe(TOPIC_STATUS.not_started)
  })

  it('status string takes precedence over completion_pct', () => {
    expect(resolveTopicStatus({ status: 'Reviewing', completion_pct: 0 })).toBe(TOPIC_STATUS.reviewing)
    expect(resolveTopicStatus({ status: 'Complete', completion_pct: 50 })).toBe(TOPIC_STATUS.complete)
  })
})

describe('aggregateStatus', () => {
  it('empty list is not_started', () => {
    expect(aggregateStatus([])).toBe(TOPIC_STATUS.not_started)
    expect(aggregateStatus(null)).toBe(TOPIC_STATUS.not_started)
    expect(aggregateStatus(undefined)).toBe(TOPIC_STATUS.not_started)
  })

  it('every topic complete is complete', () => {
    expect(aggregateStatus([
      { status: 'Complete' },
      { status: 'Complete' },
    ])).toBe(TOPIC_STATUS.complete)
  })

  it('any reviewing is reviewing even when mixed with complete and in_progress', () => {
    expect(aggregateStatus([
      { status: 'Complete' },
      { status: 'In Progress' },
      { status: 'Reviewing' },
    ])).toBe(TOPIC_STATUS.reviewing)
    expect(aggregateStatus([
      { status: 'Reviewing' },
      { status: 'Not Started' },
    ])).toBe(TOPIC_STATUS.reviewing)
  })

  it('mixed complete + not_started is in_progress', () => {
    expect(aggregateStatus([
      { status: 'Complete' },
      { status: 'Not Started' },
    ])).toBe(TOPIC_STATUS.in_progress)
  })

  it('any in_progress is in_progress', () => {
    expect(aggregateStatus([
      { status: 'Not Started' },
      { status: 'In Progress' },
    ])).toBe(TOPIC_STATUS.in_progress)
    expect(aggregateStatus([
      { status: 'Complete' },
      { status: 'In Progress' },
    ])).toBe(TOPIC_STATUS.in_progress)
  })

  it('all not_started is not_started', () => {
    expect(aggregateStatus([
      { status: 'Not Started' },
      { status: 'Not Started' },
    ])).toBe(TOPIC_STATUS.not_started)
  })

  it('single topic aggregates to its own status', () => {
    expect(aggregateStatus([{ status: 'In Progress' }])).toBe(TOPIC_STATUS.in_progress)
  })
})

describe('statusLabel', () => {
  it('returns a human label for every status', () => {
    expect(statusLabel(TOPIC_STATUS.not_started)).toBe('Not Started')
    expect(statusLabel(TOPIC_STATUS.in_progress)).toBe('In Progress')
    expect(statusLabel(TOPIC_STATUS.reviewing)).toBe('Reviewing')
    expect(statusLabel(TOPIC_STATUS.complete)).toBe('Complete')
  })

  it('defaults unknown statuses to Not Started', () => {
    expect(statusLabel('bogus')).toBe('Not Started')
    expect(statusLabel(undefined)).toBe('Not Started')
  })
})

describe('statusTone', () => {
  it('references real design tokens for every status', () => {
    expect(statusTone(TOPIC_STATUS.complete).color).toBe('var(--color-success)')
    expect(statusTone(TOPIC_STATUS.complete).soft).toBe('var(--color-success-soft)')
    expect(statusTone(TOPIC_STATUS.complete).badge).toBe('success')

    expect(statusTone(TOPIC_STATUS.reviewing).color).toBe('var(--color-info)')
    expect(statusTone(TOPIC_STATUS.reviewing).soft).toBe('var(--color-info-soft)')
    expect(statusTone(TOPIC_STATUS.reviewing).badge).toBe('info')

    expect(statusTone(TOPIC_STATUS.in_progress).color).toBe('var(--color-brand)')
    expect(statusTone(TOPIC_STATUS.in_progress).soft).toBe('var(--color-brand-soft)')
    expect(statusTone(TOPIC_STATUS.in_progress).badge).toBe('brand')

    expect(statusTone(TOPIC_STATUS.not_started).color).toBe('var(--mist)')
    expect(statusTone(TOPIC_STATUS.not_started).badge).toBe('neutral')
  })

  it('defaults unknown statuses to the not_started tone', () => {
    expect(statusTone('bogus')).toEqual(statusTone(TOPIC_STATUS.not_started))
  })
})
