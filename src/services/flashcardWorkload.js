import { REVIEW_MINUTES_PER_CARD } from '../lib/flashcardPredicates.js'
import { isValidTimezone, getDateKeyForTimezone, toEndOfDayUTC } from '../lib/dateUtils.js'
import { generateDateRange } from './rotationPlannerV2/dateUtils.js'
import { PLANNER_TABLES } from '../db/rotationPlannerSchema.js'

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

async function loadDeckMappings(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT deck_name, canonical_topic_id FROM ${PLANNER_TABLES.flashcardDeckMappings} WHERE user_id = ?`
  ).bind(userId).all()
  return results
}

function applyOverlay(baseMappings, overlay) {
  if (!overlay) return baseMappings
  const deleteSet = new Set(overlay.deletes || [])
  if (overlay.upserts) {
    for (const u of overlay.upserts) {
      if (deleteSet.has(u.deckName)) continue
    }
  }
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

export function allocateReviewMinutesByGroup(groups) {
  if (!groups || groups.length === 0) return []

  let totalCardCount = 0
  for (const g of groups) {
    totalCardCount += g.dueCardCount
  }

  const totalMinutes = Math.ceil(totalCardCount * REVIEW_MINUTES_PER_CARD)
  if (totalCardCount === 0) {
    return groups.map(g => ({ ...g, estimatedMinutes: 0 }))
  }

  const sorted = [...groups].sort((a, b) => {
    const aRaw = a.dueCardCount * REVIEW_MINUTES_PER_CARD
    const bRaw = b.dueCardCount * REVIEW_MINUTES_PER_CARD
    const aFrac = aRaw - Math.floor(aRaw)
    const bFrac = bRaw - Math.floor(bRaw)
    if (bFrac !== aFrac) return bFrac - aFrac
    if (b.dueCardCount !== a.dueCardCount) return b.dueCardCount - a.dueCardCount
    return (a.stableOrder ?? 0) - (b.stableOrder ?? 0)
  })

  const allocated = new Map()
  let remaining = totalMinutes

  for (const g of sorted) {
    const raw = g.dueCardCount * REVIEW_MINUTES_PER_CARD
    const floor = Math.floor(raw)
    allocated.set(g.key, floor)
    remaining -= floor
  }

  for (const g of sorted) {
    if (remaining <= 0) break
    allocated.set(g.key, (allocated.get(g.key) || 0) + 1)
    remaining--
  }

  return groups.map(g => ({
    ...g,
    estimatedMinutes: allocated.get(g.key) || 0,
  }))
}

export async function computeReviewWorkloadMap({
  env,
  userId,
  startDate,
  endDate,
  effectiveStartDate,
  timezone,
  availabilityByWeekday,
  blockedDates,
  planTopics,
  mappingOverlay,
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
  if (effectiveStartDate && effectiveStartDate < startDate) {
    throw new Error('effectiveStartDate must not be before startDate')
  }
  if (effectiveStartDate && effectiveStartDate > endDate) {
    throw new Error('effectiveStartDate must not be after endDate')
  }

  const effStart = effectiveStartDate || startDate
  const rangeEndUtc = toEndOfDayUTC(endDate, timezone)
  const rangeEndUtcStr = rangeEndUtc.toISOString()

  const { results: cards } = await env.DB.prepare(
    `SELECT id, deck_name, state, last_review, next_review, created_at
     FROM flashcards
     WHERE user_id = ?
       AND last_review IS NOT NULL
       AND state IN (1, 2, 3)
       AND next_review IS NOT NULL
       AND next_review <= ?
     ORDER BY next_review ASC, id ASC`
  ).bind(userId, rangeEndUtcStr).all()

  const dateRange = generateDateRange(startDate, endDate)
  const availabilityMap = buildAvailabilityMap(availabilityByWeekday)
  const blockedDatesSet = new Set(blockedDates || [])

  const rawMappings = await loadDeckMappings(env, userId)
  const deckMappings = applyOverlay(rawMappings, mappingOverlay)

  const deckToCanonical = new Map()
  for (const row of deckMappings) {
    deckToCanonical.set(row.deck_name, row.canonical_topic_id)
  }

  const planTopicByCanonical = new Map()
  if (planTopics) {
    for (const pt of planTopics) {
      if (pt.canonicalTopicId) {
        planTopicByCanonical.set(pt.canonicalTopicId, pt)
      }
    }
  }

  const dueReviewCardCountByDate = {}
  const topicCardsByDate = {}

  const unscheduled = {
    totalCards: 0,
    totalMinutes: 0,
    cards: [],
  }

  for (const card of cards) {
    const localDate = getDateKeyForTimezone(card.next_review, timezone)
    let assignedDate = null

    if (localDate < effStart) {
      assignedDate = findNextEligibleDate(effStart, dateRange, availabilityMap, blockedDatesSet)
    } else if (isDateEligible(localDate, availabilityMap, blockedDatesSet)) {
      assignedDate = localDate
    } else {
      assignedDate = findNextEligibleDate(localDate, dateRange, availabilityMap, blockedDatesSet)
    }

    if (!assignedDate) {
      unscheduled.totalCards++
      unscheduled.cards.push({
        id: card.id,
        deckName: card.deck_name,
      })
      continue
    }

    dueReviewCardCountByDate[assignedDate] = (dueReviewCardCountByDate[assignedDate] || 0) + 1

    const canonicalTopicId = deckToCanonical.get(card.deck_name) || null
    const planTopic = canonicalTopicId ? planTopicByCanonical.get(canonicalTopicId) : null

    if (!topicCardsByDate[assignedDate]) {
      topicCardsByDate[assignedDate] = []
    }

    const groupKey = planTopic
      ? `topic:${planTopic.planTopicId}`
      : 'general'

    const existing = topicCardsByDate[assignedDate].find(g => g._groupKey === groupKey)
    if (existing) {
      existing.dueCardCount++
      if (!existing.deckNames.includes(card.deck_name)) {
        existing.deckNames.push(card.deck_name)
      }
    } else {
      topicCardsByDate[assignedDate].push({
        _groupKey: groupKey,
        planTopicId: planTopic ? planTopic.planTopicId : null,
        canonicalTopicId: canonicalTopicId,
        dueCardCount: 1,
        deckNames: [card.deck_name],
        displayOrder: planTopic ? (planTopic.displayOrder ?? Infinity) : Infinity,
      })
    }
  }

  const dueReviewMinutesByDate = {}
  for (const [dateStr, count] of Object.entries(dueReviewCardCountByDate)) {
    dueReviewMinutesByDate[dateStr] = Math.ceil(count * REVIEW_MINUTES_PER_CARD)
  }

  unscheduled.totalMinutes = Math.ceil(unscheduled.totalCards * REVIEW_MINUTES_PER_CARD)

  const topicBreakdownByDate = {}
  for (const [dateStr, groups] of Object.entries(topicCardsByDate)) {
    const sorted = groups
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
        const aKey = a._groupKey
        const bKey = b._groupKey
        if (aKey === 'general') return 1
        if (bKey === 'general') return -1
        return aKey.localeCompare(bKey)
      })
      .map(g => ({
        planTopicId: g.planTopicId,
        canonicalTopicId: g.canonicalTopicId,
        dueCardCount: g.dueCardCount,
        deckNames: [...new Set(g.deckNames)].sort(),
      }))

    topicBreakdownByDate[dateStr] = sorted
  }

  const dailyBreakdown = {}
  for (const dateStr of dateRange) {
    const count = dueReviewCardCountByDate[dateStr] || 0
    dailyBreakdown[dateStr] = {
      dueCardCount: count,
      dueReviewMinutes: Math.ceil(count * REVIEW_MINUTES_PER_CARD),
    }
  }

  let totalDueCards = 0
  for (const count of Object.values(dueReviewCardCountByDate)) {
    totalDueCards += count
  }
  totalDueCards += unscheduled.totalCards

  let totalDueMinutes = 0
  for (const minutes of Object.values(dueReviewMinutesByDate)) {
    totalDueMinutes += minutes
  }
  totalDueMinutes += unscheduled.totalMinutes

  return {
    dueReviewMinutesByDate,
    dueReviewCardCountByDate,
    dailyBreakdown,
    topicBreakdownByDate,
    unscheduled,
    totalDueCards,
    totalDueMinutes,
  }
}
