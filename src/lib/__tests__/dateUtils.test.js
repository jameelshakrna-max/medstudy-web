import { describe, it, expect } from 'vitest'
import {
  isValidTimezone,
  getDateKeyInTimezone,
  getDateKeyForTimezone,
  wallClockToUTC,
  toStartOfDayUTC,
  toEndOfDayUTC,
} from '../dateUtils.js'

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

describe('wallClockToUTC', () => {
  it('UTC: midnight', () => {
    const result = wallClockToUTC(2026, 6, 15, 0, 0, 0, 'UTC')
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('UTC+3 (Africa/Cairo): midnight local = 21:00 UTC previous day', () => {
    const result = wallClockToUTC(2026, 7, 1, 0, 0, 0, 'Africa/Cairo')
    expect(result.toISOString()).toBe('2026-06-30T21:00:00.000Z')
  })

  it('UTC-5 (America/New_York): midnight local = 05:00 UTC same day', () => {
    const result = wallClockToUTC(2026, 1, 15, 0, 0, 0, 'America/New_York')
    expect(result.toISOString()).toBe('2026-01-15T05:00:00.000Z')
  })

  it('Half-hour offset (Asia/Kolkata): midnight local = 18:30 UTC previous day', () => {
    const result = wallClockToUTC(2026, 6, 1, 0, 0, 0, 'Asia/Kolkata')
    expect(result.toISOString()).toBe('2026-05-31T18:30:00.000Z')
  })

  it('DST spring-forward (Europe/London): 2026-03-29 02:00 BST = 01:00 UTC', () => {
    const result = wallClockToUTC(2026, 3, 29, 2, 0, 0, 'Europe/London')
    expect(result.toISOString()).toBe('2026-03-29T01:00:00.000Z')
  })

  it('DST fall-back (America/New_York): 2026-11-01 01:30 EST = 06:30 UTC', () => {
    const result = wallClockToUTC(2026, 11, 1, 1, 30, 0, 'America/New_York')
    expect(result.toISOString()).toBe('2026-11-01T06:30:00.000Z')
  })

  it('Asia/Tokyo: noon local = 03:00 UTC', () => {
    const result = wallClockToUTC(2026, 6, 15, 12, 0, 0, 'Asia/Tokyo')
    expect(result.toISOString()).toBe('2026-06-15T03:00:00.000Z')
  })

  it('invalid timezone throws', () => {
    expect(() => wallClockToUTC(2026, 1, 1, 0, 0, 0, 'Invalid/Zone')).toThrow(
      /wallClockToUTC: invalid timezone/,
    )
  })
})

describe('toStartOfDayUTC', () => {
  it('UTC', () => {
    const result = toStartOfDayUTC('2026-06-15', 'UTC')
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('UTC+3 (Africa/Cairo)', () => {
    const result = toStartOfDayUTC('2026-07-01', 'Africa/Cairo')
    expect(result.toISOString()).toBe('2026-06-30T21:00:00.000Z')
  })

  it('UTC-5 (America/New_York)', () => {
    const result = toStartOfDayUTC('2026-01-15', 'America/New_York')
    expect(result.toISOString()).toBe('2026-01-15T05:00:00.000Z')
  })

  it('Half-hour offset (Asia/Kolkata)', () => {
    const result = toStartOfDayUTC('2026-06-01', 'Asia/Kolkata')
    expect(result.toISOString()).toBe('2026-05-31T18:30:00.000Z')
  })

  it('DST spring (Europe/London)', () => {
    const result = toStartOfDayUTC('2026-03-29', 'Europe/London')
    expect(result.toISOString()).toBe('2026-03-29T00:00:00.000Z')
  })

  it('DST fall (America/New_York)', () => {
    const result = toStartOfDayUTC('2026-11-01', 'America/New_York')
    expect(result.toISOString()).toBe('2026-11-01T04:00:00.000Z')
  })

  it('Month boundary: Aug 1 NYC', () => {
    const result = toStartOfDayUTC('2026-08-01', 'America/New_York')
    expect(result.toISOString()).toBe('2026-08-01T04:00:00.000Z')
  })

  it('Year boundary: Jan 1 2027 Tokyo', () => {
    const result = toStartOfDayUTC('2027-01-01', 'Asia/Tokyo')
    expect(result.toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })
})

describe('toEndOfDayUTC', () => {
  it('UTC: end of day = start of next day - 1ms', () => {
    const end = toEndOfDayUTC('2026-07-15', 'UTC')
    const nextStart = toStartOfDayUTC('2026-07-16', 'UTC')
    expect(end.getTime()).toBe(nextStart.getTime() - 1)
  })

  it('New York end-of-day: 2026-07-15', () => {
    const end = toEndOfDayUTC('2026-07-15', 'America/New_York')
    expect(end.toISOString()).toBe('2026-07-16T03:59:59.999Z')
  })

  it('End-of-day invariant across timezones', () => {
    const timezones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Africa/Cairo', 'Asia/Gaza']
    for (const tz of timezones) {
      const end = toEndOfDayUTC('2026-07-15', tz)
      const nextStart = toStartOfDayUTC('2026-07-16', tz)
      expect(end.getTime()).toBe(nextStart.getTime() - 1)
    }
  })

  it('Month boundary: Jan 31 NYC', () => {
    const end = toEndOfDayUTC('2026-01-31', 'America/New_York')
    const nextStart = toStartOfDayUTC('2026-02-01', 'America/New_York')
    expect(end.getTime()).toBe(nextStart.getTime() - 1)
  })

  it('Year boundary: Dec 31 2026 Tokyo', () => {
    const end = toEndOfDayUTC('2026-12-31', 'Asia/Tokyo')
    const nextStart = toStartOfDayUTC('2027-01-01', 'Asia/Tokyo')
    expect(end.getTime()).toBe(nextStart.getTime() - 1)
  })
})

describe('Asia/Gaza (UTC+2/+3 with DST)', () => {
  it('summer: start of day = 21:00 UTC previous day', () => {
    expect(toStartOfDayUTC('2026-06-15', 'Asia/Gaza').toISOString()).toBe(
      '2026-06-14T21:00:00.000Z',
    )
  })

  it('winter: start of day = 22:00 UTC previous day', () => {
    expect(toStartOfDayUTC('2026-01-15', 'Asia/Gaza').toISOString()).toBe(
      '2026-01-14T22:00:00.000Z',
    )
  })

  it('year boundary: Jan 1 2027 start = Dec 31 22:00 UTC', () => {
    expect(toStartOfDayUTC('2027-01-01', 'Asia/Gaza').toISOString()).toBe(
      '2026-12-31T22:00:00.000Z',
    )
  })

  it('spring-forward: Mar 29 2026 flips +2 → +3', () => {
    expect(toStartOfDayUTC('2026-03-28', 'Asia/Gaza').toISOString()).toBe(
      '2026-03-27T22:00:00.000Z',
    )
    expect(toStartOfDayUTC('2026-03-29', 'Asia/Gaza').toISOString()).toBe(
      '2026-03-28T21:00:00.000Z',
    )
  })

  it('fall-back: Oct 25 2026 flips +3 → +2', () => {
    expect(toStartOfDayUTC('2026-10-24', 'Asia/Gaza').toISOString()).toBe(
      '2026-10-23T21:00:00.000Z',
    )
    expect(toStartOfDayUTC('2026-10-25', 'Asia/Gaza').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    )
  })

  it('round-trip key stability on DST days, month end, and year end', () => {
    for (const key of [
      '2026-03-28',
      '2026-03-29',
      '2026-10-24',
      '2026-10-25',
      '2026-06-15',
      '2026-12-31',
      '2027-01-01',
    ]) {
      const startUtc = toStartOfDayUTC(key, 'Asia/Gaza')
      expect(getDateKeyForTimezone(startUtc.toISOString(), 'Asia/Gaza')).toBe(key)
      const endUtc = toEndOfDayUTC(key, 'Asia/Gaza')
      expect(getDateKeyForTimezone(endUtc.toISOString(), 'Asia/Gaza')).toBe(key)
    }
  })
})
