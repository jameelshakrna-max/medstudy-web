/*
 * ═══════════════════════════════════════════════════════════════════
 *  Rotation Planner — Deterministic Scheduling Engine
 *
 *  Pure client-side service. Takes a rotation plan configuration
 *  and source catalog data, produces a day-by-day schedule.
 *
 *  No DB access — all inputs are passed in, all outputs returned.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Generate a random UUID v4 (client-safe, no crypto dependency required).
 * Falls back to Math.random if crypto is unavailable.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date in local time.
 */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Format a Date to YYYY-MM-DD.
 */
function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Exported: distributeUWorld ─────────────────────────────────────

/**
 * Distributes total UWorld questions proportionally across topics
 * based on word count.
 *
 * @param {Array} topics - array of topic objects with word_count
 * @param {number} totalQuestions - total UWorld questions to distribute
 * @returns {Map<string, number>} - topic_id → question count
 */
export function distributeUWorld(topics, totalQuestions) {
  const totalWords = topics.reduce((sum, t) => sum + (t.word_count || 0), 0)
  if (totalWords === 0 || totalQuestions === 0) return new Map()

  const distribution = new Map()
  let assigned = 0

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i]
    if (i === topics.length - 1) {
      // Last topic gets the remainder to avoid rounding drift
      distribution.set(t.topic_id, totalQuestions - assigned)
    } else {
      const count = Math.round((t.word_count / totalWords) * totalQuestions)
      distribution.set(t.topic_id, count)
      assigned += count
    }
  }

  return distribution
}

// ── Exported: calculateTopicWorkload ───────────────────────────────

/**
 * Calculates workload for a single topic.
 *
 * @param {Object} topic - topic from source catalog
 * @param {string} studyStyle - 'focused' | 'active' | 'detailed'
 * @param {number} paceMultiplier - user's personal pace (1.0 = source estimate)
 * @returns {{ studyMinutes: number, studyMinutesLow: number, studyMinutesHigh: number }}
 */
export function calculateTopicWorkload(topic, studyStyle, paceMultiplier = 1.0) {
  let minutes
  let minutesLow, minutesHigh

  if (studyStyle === 'focused') {
    minutes = topic.focused_minutes || 0
    minutesLow = Math.ceil(minutes * 0.85)
    minutesHigh = Math.ceil(minutes * 1.15)
  } else if (studyStyle === 'detailed') {
    minutes = topic.detailed_notes_minutes || 0
    minutesLow = Math.ceil(minutes * 0.8)
    minutesHigh = Math.ceil(minutes * 1.2)
  } else {
    // active (default)
    minutes = topic.active_minutes || 0
    minutesLow = topic.active_low_minutes || Math.ceil(minutes * 0.85)
    minutesHigh = topic.active_high_minutes || Math.ceil(minutes * 1.15)
  }

  return {
    studyMinutes: Math.ceil(minutes * paceMultiplier),
    studyMinutesLow: Math.ceil(minutesLow * paceMultiplier),
    studyMinutesHigh: Math.ceil(minutesHigh * paceMultiplier),
  }
}

// ── Exported: generateSchedule ─────────────────────────────────────

/**
 * Main scheduling function. Produces an array of schedule entries.
 *
 * @param {Object} plan - rotation plan config
 * @param {Array} sourceTopics - topics from source catalog (heading_kind === 'topic' only)
 * @param {Array} availability - day-of-week availability settings
 * @param {number} flashcardDueMinutes - estimated minutes of due flashcards per day
 * @returns {Array<Object>} - schedule entries sorted by date and sort_order
 */
export function generateSchedule(plan, sourceTopics, availability, flashcardDueMinutes = 0) {
  // 1. Generate list of dates from start_date to end_date
  const dates = generateDateRange(plan.start_date, plan.end_date)

  // 2. Build availability map: date string → { available_minutes, is_hospital_day, is_day_off }
  const availabilityMap = buildAvailabilityMap(dates, availability)

  // 3. Calculate UWorld distribution across topics
  const uworldDistribution = distributeUWorld(sourceTopics, plan.uworld_total_questions || 0)

  // 4. Build topic queue with workloads
  const topicQueue = buildTopicQueue(sourceTopics, plan, uworldDistribution)

  // 5. Allocate topics to days
  const entries = allocateToDays(dates, availabilityMap, topicQueue, plan, flashcardDueMinutes)

  // 6. Sort by date then sort_order
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.sort_order - b.sort_order)

  return entries
}

// ── Exported: getTodaySchedule ─────────────────────────────────────

/**
 * Filters a schedule to entries for a specific date.
 *
 * @param {Array} schedule - full schedule array
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {Array<Object>} - entries for that date
 */
export function getTodaySchedule(schedule, dateStr) {
  return schedule.filter((e) => e.date === dateStr)
}

// ── Exported: getScheduleStats ─────────────────────────────────────

/**
 * Computes summary statistics over a schedule.
 *
 * @param {Array} schedule - full schedule array
 * @param {Array} completedEntries - entries with completion status
 * @returns {Object} - stats object
 */
export function getScheduleStats(schedule, completedEntries = []) {
  const completedIds = new Set(completedEntries.map((e) => e.id))
  const totalEntries = schedule.length
  const completedCount = completedEntries.filter((e) => e.status === 'completed').length
  const uniqueTopics = new Set(schedule.filter((e) => e.topic_id).map((e) => e.topic_id))
  const completedTopics = new Set(
    completedEntries
      .filter((e) => e.status === 'completed' && e.topic_id)
      .map((e) => e.topic_id),
  )
  const totalUWorld = schedule.reduce((sum, e) => sum + (e.uworld_questions || 0), 0)
  const totalStudyMinutes = schedule
    .filter((e) => e.activity_type === 'study')
    .reduce((sum, e) => sum + (e.estimated_minutes || 0), 0)
  const totalDays = new Set(schedule.map((e) => e.date)).size

  return {
    totalEntries,
    completedCount,
    pendingCount: totalEntries - completedCount,
    completionPct: totalEntries ? Math.round((completedCount / totalEntries) * 100) : 0,
    totalTopics: uniqueTopics.size,
    completedTopics: completedTopics.size,
    totalUWorldQuestions: totalUWorld,
    totalStudyMinutes,
    totalDays,
  }
}

// ── Exported: recalculateSchedule ──────────────────────────────────

/**
 * Recalculates a schedule while preserving completed/in-progress entries.
 *
 * @param {Object} plan - rotation plan config
 * @param {Array} existingSchedule - current schedule entries
 * @param {Array} existingProgress - topic progress records
 * @param {Array} sourceTopics - topics from source catalog
 * @param {Array} availability - day-of-week availability settings
 * @param {number} flashcardDueMinutes - estimated minutes of due flashcards per day
 * @returns {Array<Object>} - merged schedule
 */
export function recalculateSchedule(
  plan,
  existingSchedule,
  existingProgress,
  sourceTopics,
  availability,
  flashcardDueMinutes = 0,
) {
  // Keep completed entries as-is
  const completed = existingSchedule.filter(
    (e) => e.status === 'completed' || e.status === 'in_progress',
  )

  // Get the last completed date (or start_date if none)
  const lastCompletedDate =
    completed.length > 0
      ? completed.reduce((max, e) => (e.date > max ? e.date : max), completed[0].date)
      : plan.start_date

  // Find topics that still need work
  const incompleteTopics = sourceTopics.filter((t) => {
    const progress = existingProgress.find((p) => p.topic_id === t.topic_id)
    return !progress || progress.study_status !== 'completed' || progress.uworld_status !== 'completed'
  })

  // Generate new schedule from lastCompletedDate to end_date
  const newPlan = { ...plan, start_date: lastCompletedDate }
  const newSchedule = generateSchedule(newPlan, incompleteTopics, availability, flashcardDueMinutes)

  // Merge: completed entries + new entries (skip dates that have completed entries)
  const completedDates = new Set(completed.map((e) => e.date))
  const freshEntries = newSchedule.filter((e) => !completedDates.has(e.date))

  return [...completed, ...freshEntries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sort_order - b.sort_order,
  )
}

// ══════════════════════════════════════════════════════════════════
//  Internal Helpers
// ══════════════════════════════════════════════════════════════════

/**
 * Returns array of ISO date strings from start to end inclusive.
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string[]}
 */
function generateDateRange(startDate, endDate) {
  const dates = []
  const current = parseDate(startDate)
  const end = parseDate(endDate)

  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * Maps each date string to its availability config based on day_of_week.
 *
 * @param {string[]} dates - array of ISO date strings
 * @param {Array} availability - day-of-week availability settings
 * @returns {Map<string, Object>}
 */
function buildAvailabilityMap(dates, availability) {
  const map = new Map()

  // Build a lookup by day_of_week
  const byDow = new Map()
  for (const entry of availability) {
    byDow.set(entry.day_of_week, {
      available_minutes: entry.available_minutes || 0,
      is_hospital_day: entry.is_hospital_day ? 1 : 0,
      is_day_off: entry.is_day_off ? 1 : 0,
    })
  }

  for (const dateStr of dates) {
    const d = parseDate(dateStr)
    const dow = d.getDay() // 0=Sun, 6=Sat
    const config = byDow.get(dow) || {
      available_minutes: 0,
      is_hospital_day: 0,
      is_day_off: 1,
    }
    map.set(dateStr, config)
  }

  return map
}

/**
 * Creates ordered array of topic queue objects with pre-calculated workloads.
 *
 * @param {Array} sourceTopics - topics from source catalog
 * @param {Object} plan - rotation plan config
 * @param {Map<string, number>} uworldDistribution - topic_id → question count
 * @returns {Array<Object>}
 */
function buildTopicQueue(sourceTopics, plan, uworldDistribution) {
  const style = plan.scheduling_style || 'efficient'
  const pace = plan.personal_pace_multiplier || 1.0
  const avgMinPerQ = plan.avg_minutes_per_question || 1.5

  return sourceTopics.map((topic) => {
    const workload = calculateTopicWorkload(topic, plan.study_style, pace)
    const uworldQs = uworldDistribution.get(topic.topic_id) || 0
    const uworldMinutes = Math.ceil(uworldQs * avgMinPerQ)

    return {
      topic_id: topic.topic_id,
      topic: topic.topic,
      rotation: topic.rotation,
      studyMinutes: workload.studyMinutes,
      studyMinutesLow: workload.studyMinutesLow,
      studyMinutesHigh: workload.studyMinutesHigh,
      uworldQuestions: uworldQs,
      uworldMinutes,
      totalMinutes: workload.studyMinutes + uworldMinutes,
      studyCompleted: false,
      uworldCompleted: false,
    }
  })
}

/**
 * Creates a schedule entry object.
 *
 * @param {string} date - ISO date string
 * @param {string|null} topicId - topic_id or null
 * @param {string} activityType - 'study' | 'uworld' | 'flashcards' | 'mixed'
 * @param {string} description - human-readable description
 * @param {number} estimatedMinutes - estimated duration
 * @param {number} uworldQuestions - number of UWorld questions
 * @param {string} uworldMode - 'tutor' | 'timed'
 * @param {number} sortOrder - ordering within the day
 * @returns {Object}
 */
function createEntry(date, topicId, activityType, description, estimatedMinutes, uworldQuestions, uworldMode, sortOrder) {
  return {
    id: generateId(),
    date,
    topic_id: topicId,
    activity_type: activityType,
    description,
    estimated_minutes: estimatedMinutes,
    uworld_questions: uworldQuestions || 0,
    uworld_mode: uworldMode || null,
    sort_order: sortOrder,
  }
}

/**
 * Core allocation algorithm: assigns topics to days based on availability.
 *
 * @param {string[]} dates - all dates in the range
 * @param {Map<string, Object>} availabilityMap - date → availability config
 * @param {Array<Object>} topicQueue - ordered topic queue with workloads
 * @param {Object} plan - rotation plan config
 * @param {number} flashcardDueMinutes - estimated flashcard minutes per day
 * @returns {Array<Object>} - schedule entries
 */
function allocateToDays(dates, availabilityMap, topicQueue, plan, flashcardDueMinutes) {
  const entries = []
  const flashcardEnabled = plan.flashcard_review_enabled ? true : false
  const flashcardMaxMinutes = plan.flashcard_max_minutes || 30
  const planningBuffer = plan.planning_buffer_minutes || 30
  const uworldMode = plan.uworld_mode || 'tutor'
  const schedulingStyle = plan.scheduling_style || 'efficient'
  const perDayMin = plan.questions_per_day_min || 20
  const perDayMax = plan.questions_per_day_max || 40
  const preferredPerDay = plan.preferred_questions_per_day || 30

  // Track remaining work per topic (mutable clones)
  const remaining = topicQueue.map((t) => ({ ...t }))

  // Current topic index pointer
  let topicIdx = 0

  for (const dateStr of dates) {
    const avail = availabilityMap.get(dateStr)

    // Skip day off
    if (avail.is_day_off) continue

    // Calculate effective minutes (hospital days reduced by 40%)
    let effectiveMinutes = avail.available_minutes
    if (avail.is_hospital_day) {
      effectiveMinutes = Math.floor(effectiveMinutes * 0.6)
    }

    // Reserve flashcard time if enabled
    let flashcardTime = 0
    if (flashcardEnabled && flashcardDueMinutes > 0) {
      const maxAllowed = Math.floor(effectiveMinutes * 0.3)
      flashcardTime = Math.min(flashcardDueMinutes, flashcardMaxMinutes, maxAllowed)
    }

    // Reserve planning buffer
    effectiveMinutes = Math.max(0, effectiveMinutes - planningBuffer)

    // Remaining capacity after flashcards and buffer
    let remainingMinutes = Math.max(0, effectiveMinutes - flashcardTime)

    let sortOrder = 0

    // Schedule flashcards first
    if (flashcardTime > 0) {
      entries.push(
        createEntry(
          dateStr,
          null,
          'flashcards',
          'Flashcard Review',
          flashcardTime,
          0,
          null,
          sortOrder++,
        ),
      )
    }

    // Skip allocation if no capacity left
    if (remainingMinutes <= 0) continue

    // ── Scheduling loop ──
    if (schedulingStyle === 'focused') {
      // Fill day with current topic's study until completed,
      // then UWorld, then move to next topic
      while (remainingMinutes > 0 && topicIdx < remaining.length) {
        const current = remaining[topicIdx]

        // Study phase
        if (!current.studyCompleted && current.studyMinutes > 0) {
          const studyTime = Math.min(current.studyMinutes, remainingMinutes)
          entries.push(
            createEntry(
              dateStr,
              current.topic_id,
              'study',
              `${current.topic} — Study`,
              studyTime,
              0,
              null,
              sortOrder++,
            ),
          )
          remainingMinutes -= studyTime
          current.studyMinutes -= studyTime
          if (current.studyMinutes <= 0) {
            current.studyCompleted = true
          }
          continue
        }

        // UWorld phase (only after study is completed)
        if (current.studyCompleted && !current.uworldCompleted && current.uworldQuestions > 0) {
          // Calculate how many questions fit in remaining time
          const avgMinPerQ = plan.avg_minutes_per_question || 1.5
          const maxQsByTime = Math.floor(remainingMinutes / avgMinPerQ)
          const maxQsByCap = preferredPerDay
          const questionsToday = Math.min(
            current.uworldQuestions,
            maxQsByTime,
            maxQsByCap,
          )

          if (questionsToday > 0) {
            const qMinutes = Math.ceil(questionsToday * avgMinPerQ)
            entries.push(
              createEntry(
                dateStr,
                current.topic_id,
                'uworld',
                `${current.topic} — UWorld (${questionsToday} questions)`,
                qMinutes,
                questionsToday,
                uworldMode,
                sortOrder++,
              ),
            )
            remainingMinutes -= qMinutes
            current.uworldQuestions -= questionsToday
            current.uworldMinutes = Math.ceil(current.uworldQuestions * avgMinPerQ)
            current.totalMinutes = current.studyMinutes + current.uworldMinutes
          }

          if (current.uworldQuestions <= 0) {
            current.uworldCompleted = true
          }
          continue
        }

        // Topic fully done — move to next
        topicIdx++
      }
    } else {
      // scheduling_style === 'efficient'
      // Fill study first, then UWorld (current topic, then mixed),
      // then start next topic's study
      while (remainingMinutes > 0 && topicIdx < remaining.length) {
        const current = remaining[topicIdx]

        // Study phase
        if (!current.studyCompleted && current.studyMinutes > 0) {
          const studyTime = Math.min(current.studyMinutes, remainingMinutes)
          entries.push(
            createEntry(
              dateStr,
              current.topic_id,
              'study',
              `${current.topic} — Study`,
              studyTime,
              0,
              null,
              sortOrder++,
            ),
          )
          remainingMinutes -= studyTime
          current.studyMinutes -= studyTime
          if (current.studyMinutes <= 0) {
            current.studyCompleted = true
          }
          continue
        }

        // After study done, fill remaining capacity with UWorld
        // Current topic first, then overflow to next topics
        if (current.studyCompleted && !current.uworldCompleted && current.uworldQuestions > 0) {
          const avgMinPerQ = plan.avg_minutes_per_question || 1.5
          const maxQsByTime = Math.floor(remainingMinutes / avgMinPerQ)
          const questionsToday = Math.min(current.uworldQuestions, maxQsByTime)

          if (questionsToday > 0) {
            const qMinutes = Math.ceil(questionsToday * avgMinPerQ)
            entries.push(
              createEntry(
                dateStr,
                current.topic_id,
                'uworld',
                `${current.topic} — UWorld (${questionsToday} questions)`,
                qMinutes,
                questionsToday,
                uworldMode,
                sortOrder++,
              ),
            )
            remainingMinutes -= qMinutes
            current.uworldQuestions -= questionsToday
            current.uworldMinutes = Math.ceil(current.uworldQuestions * avgMinPerQ)
            current.totalMinutes = current.studyMinutes + current.uworldMinutes
          }

          if (current.uworldQuestions <= 0) {
            current.uworldCompleted = true
          }
          continue
        }

        // Current topic fully done — move to next
        topicIdx++
      }
    }
  }

  return entries
}
