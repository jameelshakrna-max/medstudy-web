import { getDateKeyForTimezone, toEndOfDayUTC } from '../../lib/dateUtils.js'
import { generateDateRange } from '../rotationPlannerV2/dateUtils.js'
import { loadDueReviewCardsPaginated } from '../flashcardPagination.js'

function buildAvailabilityMap(availabilityByWeekday) {
  if (availabilityByWeekday instanceof Map) return availabilityByWeekday
  if (Array.isArray(availabilityByWeekday)) {
    const map = new Map()
    for (const entry of availabilityByWeekday) {
      map.set(entry.weekday, {
        isDayOff: entry.isDayOff,
        availableMinutes: entry.availableMinutes,
      })
    }
    return map
  }
  return new Map()
}

function isDateEligible(dateKey, availabilityByWeekday, blockedDatesSet) {
  if (blockedDatesSet.has(dateKey)) return false
  const parts = dateKey.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const weekday = d.getDay()
  const entry = availabilityByWeekday.get(weekday)
  if (!entry) return false
  if (entry.isDayOff) return false
  if (!entry.availableMinutes || entry.availableMinutes <= 0) return false
  return true
}

function findNextEligibleDate(startDate, dateRange, availabilityByWeekday, blockedDatesSet) {
  for (const dateKey of dateRange) {
    if (dateKey < startDate) continue
    if (isDateEligible(dateKey, availabilityByWeekday, blockedDatesSet)) {
      return dateKey
    }
  }
  return null
}

export function createEmptyFlashcardForecast() {
  return {
    safeNewCardsByDate: {},
    projectedReviewCardCountByDate: {},
    projectedReviewMinutesByDate: {},
    baselineReviewCardCountByDate: {},
    acceptedCardCount: 0,
    rejectedCardCount: 0,
    rejectionCounts: {
      unmappedDeck: 0,
      topicAbsentFromPlan: 0,
      topicLocked: 0,
      noEligibleIntroductionDate: 0,
      projectedLoadExceeded: 0,
      invalidCardState: 0,
    },
    truncated: false,
    candidateLimitReached: false,
    forecastHorizonEndDate: null,
  }
}

export async function computeExistingReviewBaseline({
  env,
  userId,
  forecastHorizonEndDate,
  effectiveStartDate,
  timezone,
  availabilityByWeekday,
  blockedDates,
}) {
  if (!forecastHorizonEndDate) {
    return {}
  }

  const rangeEndUtc = toEndOfDayUTC(forecastHorizonEndDate, timezone || 'UTC')
  const rangeEndUtcStr = rangeEndUtc.toISOString()

  const cards = await loadDueReviewCardsPaginated(env, userId, rangeEndUtcStr)

  if (!cards || cards.length === 0) {
    return {}
  }

  const effStart = effectiveStartDate

  const planEndDate = forecastHorizonEndDate

  const allDates = generateDateRange(effStart, planEndDate)

  const availabilityMap = buildAvailabilityMap(availabilityByWeekday)
  const blockedDatesSet = new Set(blockedDates || [])

  const eligibleDates = allDates.filter(dk => isDateEligible(dk, availabilityMap, blockedDatesSet))

  const existingReviewCardCountByDate = {}

  for (const card of cards) {
    const localDate = getDateKeyForTimezone(card.next_review, timezone || 'UTC')
    let assignedDate = null

    if (localDate < effStart) {
      assignedDate = findNextEligibleDate(effStart, eligibleDates, availabilityMap, blockedDatesSet)
    } else if (isDateEligible(localDate, availabilityMap, blockedDatesSet)) {
      assignedDate = localDate
    } else {
      assignedDate = findNextEligibleDate(localDate, eligibleDates, availabilityMap, blockedDatesSet)
    }

    if (!assignedDate) continue

    existingReviewCardCountByDate[assignedDate] = (existingReviewCardCountByDate[assignedDate] || 0) + 1
  }

  return existingReviewCardCountByDate
}
