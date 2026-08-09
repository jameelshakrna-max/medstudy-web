import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invalidateFlashcardProgressQueries } from '../flashcardProgressInvalidation'

const { mockInvalidateQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
}))

vi.mock('../queryKeys', () => ({
  queryKeys: {
    flashcards: { all: ['flashcards'] },
    rotations: { all: ['rotations'] },
    tracking: { all: ['tracking'] },
    dashboard: { all: ['dashboard'] },
  },
}))

describe('invalidateFlashcardProgressQueries', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear()
  })

  it('invalidates flashcards, rotations, tracking, and dashboard prefixes', () => {
    invalidateFlashcardProgressQueries({ invalidateQueries: mockInvalidateQueries })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['flashcards'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rotations'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] })
  })

  it('does nothing when the query client is missing', () => {
    expect(() => invalidateFlashcardProgressQueries(null)).not.toThrow()
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})
