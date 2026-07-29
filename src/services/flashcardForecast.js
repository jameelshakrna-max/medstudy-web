import { FSRS, Card, State, Rating } from 'fsrs.js'
import { REVIEW_MINUTES_PER_CARD } from '../lib/flashcardPredicates.js'
import { isValidTimezone, getDateKeyForTimezone } from '../lib/dateUtils.js'
import { addDays, getDayOfWeek } from './rotationPlannerV2/dateUtils.js'
import { PLANNER_TABLES } from '../db/rotationPlannerSchema.js'

const MAX_SIMULATIONS_PER_CARD = 100
const MAX_CANDIDATES = 10000
const FORECAST_HORIZON_DAYS = 30
const MAX_FORECAST_SPAN_DAYS = 365

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
  const d = new Date(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)))
  const weekday = d.getDay()
  const entry = availabilityByWeekday.get(weekday)
  if (!entry) return false
  if (entry.isDayOff) return false
  if (!entry.availableMinutes || entry.availableMinutes <= 0) return false
  return true
}

function dateStrToDate(dateStr) {
  return new Date(`${dateStr}T12:00:00.000Z`)
}

function dateToDateKey(date, timezone) {
  return getDateKeyForTimezone(date.toISOString(), timezone)
}

function simulateGoodPath(fsrs, introDate, timezone) {
  const reviewDateKeys = []
  let card = new Card()
  let currentDate = introDate

  for (let i = 0; i < MAX_SIMULATIONS_PER_CARD; i++) {
    const results = fsrs.repeat(card, currentDate)
    const goodResult = results[Rating.Good]
    const nextCard = goodResult.card
    const nextDue = nextCard.due

    const dateKey = dateToDateKey(nextDue, timezone)
    reviewDateKeys.push(dateKey)

    const daysSinceIntro = (nextDue.getTime() - introDate.getTime()) / 86400000
    if (daysSinceIntro > FORECAST_HORIZON_DAYS) break

    card = nextCard
    currentDate = nextDue
  }

  return reviewDateKeys
}

export function snapToNextEligibleDate(rawDateKey, eligibleDateKeys) {
  if (!eligibleDateKeys.length) return null
  let lo = 0
  let hi = eligibleDateKeys.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (eligibleDateKeys[mid] < rawDateKey) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return lo < eligibleDateKeys.length ? eligibleDateKeys[lo] : null
}

function generateExtendedDateRange(startDate, endDate) {
  const dates = []
  let current = startDate
  while (current <= endDate) {
    dates.push(current)
    current = addDays(current, 1)
  }
  return dates
}

function buildDateEligibilityIndex(dateRange, availabilityByWeekday, blockedDatesSet) {
  const index = {}
  for (const dateKey of dateRange) {
    index[dateKey] = isDateEligible(dateKey, availabilityByWeekday, blockedDatesSet)
  }
  return index
}

function enumerateEligibleIntroDates(dateRange, effStart, endDate, topicUnlockDate, eligibilityIndex) {
  const eligible = []
  for (const dateKey of dateRange) {
    if (dateKey < effStart) continue
    if (dateKey > endDate) continue
    if (topicUnlockDate && dateKey < topicUnlockDate) continue
    if (!eligibilityIndex[dateKey]) continue
    eligible.push(dateKey)
  }
  return eligible
}

function applyMappingOverlay(baseMappings, overlay) {
  if (!overlay) return baseMappings
  const deleteSet = new Set(overlay.deletes || [])
  const map = new Map()
  for (const row of baseMappings) {
    map.set(row.deck_name, row.canonical_topic_id)
  }
  if (overlay.upserts) {
    for (const u of overlay.upserts) {
      if (!deleteSet.has(u.deckName)) {
        map.set(u.deckName, u.canonicalTopicId)
      }
    }
  }
  if (overlay.deletes) {
    for (const d of overlay.deletes) {
      map.delete(d)
    }
  }
  const result = []
  for (const [deckName, canonicalTopicId] of map) {
    result.push({ deck_name: deckName, canonical_topic_id: canonicalTopicId })
  }
  return result
}

function isTopicUnlocked(status, mode, learningCompletedAt) {
  if (mode === 'learning_completed') {
    return status === 'completed' || (status !== 'not_started' && !!learningCompletedAt)
  }
  if (mode === 'learning_started') {
    return status !== 'not_started'
  }
  throw new Error(`Unsupported learningUnlockMode: ${mode}`)
}

function getTopicUnlockDate(planTopic) {
  if (planTopic.learningCompletedAt) return planTopic.learningCompletedAt
  return null
}

export async function computeSafeNewCardForecast({
  env,
  userId,
  usesFlashcardCapacity,
  startDate,
  endDate,
  effectiveStartDate,
  timezone,
  availabilityByWeekday,
  blockedDates,
  planTopics,
  mappingOverlay,
  learningUnlockMode = 'learning_completed',
  maxProjectedFlashcardReviewMinutesPerDay,
  existingReviewCardCountByDate = {},
}) {
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`)
  }
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required')
  }
  if (startDate > endDate) {
    throw new Error('startDate must not be after endDate')
  }
  if (!Number.isInteger(maxProjectedFlashcardReviewMinutesPerDay) || maxProjectedFlashcardReviewMinutesPerDay <= 0) {
    throw new Error('maxProjectedFlashcardReviewMinutesPerDay must be a positive integer')
  }

  if (!usesFlashcardCapacity) {
    return {
      safeNewCardsByDate: {},
      projectedReviewCardCountByDate: {},
      projectedReviewMinutesByDate: {},
      baselineReviewCardCountByDate: {},
      acceptedCardCount: 0,
      rejectedCardCount: 0,
      rejectionCounts: {},
      truncated: false,
      forecastHorizonEndDate: null,
    }
  }

  const effStart = effectiveStartDate || startDate
  const availabilityMap = buildAvailabilityMap(availabilityByWeekday)
  const blockedDatesSet = new Set(blockedDates || [])
  const forecastHorizonEndDate = addDays(endDate, FORECAST_HORIZON_DAYS)

  const forecastDateRangeEnd = (() => {
    const maxSpan = addDays(startDate, MAX_FORECAST_SPAN_DAYS)
    return forecastHorizonEndDate > maxSpan ? maxSpan : forecastHorizonEndDate
  })()

  const allDates = generateExtendedDateRange(startDate, forecastDateRangeEnd)
  const eligibilityIndex = buildDateEligibilityIndex(allDates, availabilityMap, blockedDatesSet)
  const candidateDateRange = allDates.filter(dk => eligibilityIndex[dk])

  const { results: newCards } = await env.DB.prepare(
    `SELECT id, deck_name, state, last_review, next_review, created_at
     FROM flashcards
     WHERE user_id = ?
       AND (state = 0 OR last_review IS NULL)
     ORDER BY created_at ASC, id ASC`
  ).bind(userId).all()

  const rawMappings = await (async () => {
    const { results } = await env.DB.prepare(
      `SELECT deck_name, canonical_topic_id FROM ${PLANNER_TABLES.flashcardDeckMappings} WHERE user_id = ?`
    ).bind(userId).all()
    return results
  })()

  const effectiveMappings = applyMappingOverlay(rawMappings, mappingOverlay)

  const deckToCanonical = new Map()
  for (const row of effectiveMappings) {
    deckToCanonical.set(row.deck_name, row.canonical_topic_id)
  }

  const planTopicByCanonical = new Map()
  const topicStatusByCanonical = new Map()
  const learningCompletedAtByCanonical = new Map()
  if (planTopics) {
    for (const pt of planTopics) {
      if (pt.canonicalTopicId) {
        planTopicByCanonical.set(pt.canonicalTopicId, pt)
        topicStatusByCanonical.set(pt.canonicalTopicId, pt.status || 'not_started')
        if (pt.learningCompletedAt) {
          learningCompletedAtByCanonical.set(pt.canonicalTopicId, pt.learningCompletedAt)
        }
      }
    }
  }

  const fsrs = new FSRS()

  const rejectionCounts = {
    unmappedDeck: 0,
    topicAbsentFromPlan: 0,
    topicLocked: 0,
    noEligibleIntroductionDate: 0,
    projectedLoadExceeded: 0,
    invalidCardState: 0,
  }

  const safeNewCardsByDate = {}
  const projectedReviewCardCountByDate = { ...existingReviewCardCountByDate }
  const baselineReviewCardCountByDate = { ...existingReviewCardCountByDate }

  let acceptedCardCount = 0
  let rejectedCardCount = 0
  let candidateProcessedCount = 0

  for (const card of newCards) {
    candidateProcessedCount++
    if (candidateProcessedCount > MAX_CANDIDATES) {
      break
    }

    const deckName = card.deck_name
    const canonicalTopicId = deckToCanonical.get(deckName)

    if (!canonicalTopicId) {
      rejectionCounts.unmappedDeck++
      rejectedCardCount++
      continue
    }

    const planTopic = planTopicByCanonical.get(canonicalTopicId)
    if (!planTopic) {
      rejectionCounts.topicAbsentFromPlan++
      rejectedCardCount++
      continue
    }

    const status = topicStatusByCanonical.get(canonicalTopicId) || 'not_started'
    const isUnlocked = isTopicUnlocked(status, learningUnlockMode, learningCompletedAtByCanonical.get(canonicalTopicId))
    if (!isUnlocked) {
      rejectionCounts.topicLocked++
      rejectedCardCount++
      continue
    }

    if (Number(card.state) !== 0 && card.last_review !== null) {
      rejectionCounts.invalidCardState++
      rejectedCardCount++
      continue
    }

    const topicUnlockDate = getTopicUnlockDate(planTopic)

    const eligibleIntroDates = enumerateEligibleIntroDates(
      allDates, effStart, endDate, topicUnlockDate, eligibilityIndex
    )

    if (eligibleIntroDates.length === 0) {
      rejectionCounts.noEligibleIntroductionDate++
      rejectedCardCount++
      continue
    }

    let accepted = false

    for (const introDateKey of eligibleIntroDates) {
      const introDate = dateStrToDate(introDateKey)
      const projectedDates = simulateGoodPath(fsrs, introDate, timezone)

      const dateLoad = {}
      dateLoad[introDateKey] = 1

      let snapFailed = false
      for (const dk of projectedDates) {
        const snappedDk = snapToNextEligibleDate(dk, candidateDateRange)
        if (!snappedDk) {
          snapFailed = true
          break
        }
        dateLoad[snappedDk] = (dateLoad[snappedDk] || 0) + 1
      }
      if (snapFailed) continue

      let exceedsLimit = false
      for (const [dk, additionalCount] of Object.entries(dateLoad)) {
        const totalForDate = (projectedReviewCardCountByDate[dk] || 0) + additionalCount
        const projectedMinutes = Math.ceil(totalForDate * REVIEW_MINUTES_PER_CARD)
        if (projectedMinutes > maxProjectedFlashcardReviewMinutesPerDay) {
          exceedsLimit = true
          break
        }
      }

      if (!exceedsLimit) {
        for (const [dk, additionalCount] of Object.entries(dateLoad)) {
          projectedReviewCardCountByDate[dk] = (projectedReviewCardCountByDate[dk] || 0) + additionalCount
        }

        const projectedReviewDates = [...new Set(
          projectedDates
            .map(dk => snapToNextEligibleDate(dk, candidateDateRange))
            .filter(dk => dk && dk !== introDateKey)
        )].sort()

        if (!safeNewCardsByDate[introDateKey]) {
          safeNewCardsByDate[introDateKey] = []
        }
        safeNewCardsByDate[introDateKey].push({
          cardId: card.id,
          deckName,
          planTopicId: planTopic.planTopicId,
          canonicalTopicId,
          projectedReviewDates,
        })

        acceptedCardCount++
        accepted = true
        break
      }
    }

    if (!accepted) {
      rejectionCounts.projectedLoadExceeded++
      rejectedCardCount++
    }
  }

  const projectedReviewMinutesByDate = {}
  for (const [dateKey, count] of Object.entries(projectedReviewCardCountByDate)) {
    projectedReviewMinutesByDate[dateKey] = Math.ceil(count * REVIEW_MINUTES_PER_CARD)
  }

  const sortedSafeNewCardsByDate = {}
  for (const key of Object.keys(safeNewCardsByDate).sort()) {
    const cards = safeNewCardsByDate[key]
    cards.sort((a, b) => {
      if (a.cardId < b.cardId) return -1
      if (a.cardId > b.cardId) return 1
      return 0
    })
    sortedSafeNewCardsByDate[key] = cards
  }

  const truncated = newCards.length > acceptedCardCount && rejectionCounts.projectedLoadExceeded > 0

  return {
    safeNewCardsByDate: sortedSafeNewCardsByDate,
    projectedReviewCardCountByDate,
    projectedReviewMinutesByDate,
    baselineReviewCardCountByDate,
    acceptedCardCount,
    rejectedCardCount,
    rejectionCounts,
    truncated,
    forecastHorizonEndDate,
  }
}
