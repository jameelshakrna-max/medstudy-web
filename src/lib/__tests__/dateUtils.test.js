import { describe, it, expect } from 'vitest'
import { isValidTimezone, getDateKeyInTimezone, getDateKeyForTimezone } from '../dateUtils.js'

describe('isValidTimezone', () => {
  it('valid timezone', () => expect(isValidTimezone('UTC')).toBe(true))
  it('valid named timezone', () => expect(isValidTimezone('America/New_York')).toBe(true))
  it('null', () => expect(isValidTimezone(null)).toBe(false))
  it('empty string', () => expect(isValidTimezone('')).toBe(false))
  it('invalid timezone', () => expect(isValidTimezone('Not/Real/Zone')).toBe(false))
})

describe('getDateKeyInTimezone', () => {
  it('UTC date', () => {
    const date = new Date('2026-01-06T03:30:00.000Z')
    expect(getDateKeyInTimezone(date, 'UTC')).toBe('2026-01-06')
  })
  it('same instant, earlier timezone offset', () => {
    const date = new Date('2026-01-06T03:30:00.000Z')
    expect(getDateKeyInTimezone(date, 'America/New_York')).toBe('2026-01-05')
  })
  it('same instant, later timezone offset', () => {
    const date = new Date('2026-01-06T03:30:00.000Z')
    expect(getDateKeyInTimezone(date, 'Asia/Tokyo')).toBe('2026-01-06')
  })
})

describe('getDateKeyForTimezone', () => {
  it('ISO string with timezone', () => {
    expect(getDateKeyForTimezone('2026-01-06T03:30:00.000Z', 'America/New_York')).toBe('2026-01-05')
  })
  it('ISO string UTC', () => {
    expect(getDateKeyForTimezone('2026-01-06T03:30:00.000Z', 'UTC')).toBe('2026-01-06')
  })
})
