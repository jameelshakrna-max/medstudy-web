import { CURATED_UWORLD_QUESTION_GROUPS } from '../../data/uworldQuestionGroups/index.js'
import { getAllNormalizedTopics } from '../../data/studySources/normalizedRegistry.js'

const GROUP_KEY_PATTERN = /^[a-z0-9][a-z0-9.-]*$/

let globalTitleById = null

// Best-effort title lookup for topics that may not exist in the selected
// source/rotation. Keyed by sourceTopicId AND canonicalTopicId so unavailable
// required topics can still surface a human-readable title. Built lazily from
// the normalized registry (memoized) and never throws.
function getGlobalTitleById() {
  if (globalTitleById) return globalTitleById
  const map = new Map()
  try {
    for (const t of getAllNormalizedTopics()) {
      if (t.sourceTopicId) map.set(t.sourceTopicId, t)
      if (t.canonicalTopicId) map.set(t.canonicalTopicId, t)
    }
  } catch {
    // Global lookup is optional; titles fall back to the raw id.
  }
  globalTitleById = map
  return map
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fallbackSectionKey(section) {
  return `fallback-${slugify(section)}`
}

function fallbackTopicKey(sourceTopicId) {
  return `fallback-${slugify(sourceTopicId)}`
}

// Build the immutable question-group snapshot for a grouped plan.
//
// Curated groups form when the user selected at least one of their member
// topics. Topics claimed by a formed curated group (included OR excluded) never
// fall back to generic groups. Remaining topics are grouped by curriculum
// section; topics without a usable section become per-topic fallback groups.
//
// Exclusions are validated against the candidate keys (curated + fallback) that
// will be produced by this builder. Unknown keys are rejected with
// UNKNOWN_QUESTION_GROUP. Exclusions apply to curated AND fallback groups and
// are persisted in the snapshot as `excluded: 1`.
//
// Source adaptation: curated defs list requiredTopicIds for a full UWorld
// universe, but the selected source+rotation may not cover every required
// topic. Only SOURCE-SUPPORTED required topics that the user has not selected
// make a group actionable/incomplete. Required topics absent from the source
// are informational only (`sourceAdaptedQuestionGroups`) and are NOT persisted
// in the snapshot's requiredTopicIds (no permanently-impossible locks).
export function buildQuestionGroups({ resolvedTopics, supportedTopics = [], preferredQuestionsPerDay, questionGroupExclusions = [] }) {
  const errors = []
  const exclusionSet = new Set(questionGroupExclusions)

  const resolvedById = new Map()
  for (const t of resolvedTopics) {
    if (t.sourceTopicId) resolvedById.set(t.sourceTopicId, t)
  }

  const sourceSupportedIds = new Set(supportedTopics.map(t => t.sourceTopicId).filter(Boolean))
  const supportedById = new Map(supportedTopics.map(t => [t.sourceTopicId, t]).filter(([id]) => id))
  const globalById = getGlobalTitleById()
  const titleFor = (id) => supportedById.get(id)?.title || globalById.get(id)?.title || id

  // Step 1 — curated candidates (before exclusions so every selectable group is
  // a valid exclusion target).
  const curatedCandidates = []
  const claimedByCurated = new Set()
  for (const def of CURATED_UWORLD_QUESTION_GROUPS) {
    const memberTopicIds = def.memberTopicIds.filter(id => resolvedById.has(id))
    if (memberTopicIds.length === 0) continue
    for (const id of memberTopicIds) claimedByCurated.add(id)
    const unavailableRequiredTopicIds = def.requiredTopicIds.filter(id => !sourceSupportedIds.has(id))
    const effectiveRequiredTopicIds = def.requiredTopicIds.filter(id => sourceSupportedIds.has(id))
    const missingRequiredTopicIds = effectiveRequiredTopicIds.filter(id => !resolvedById.has(id))
    curatedCandidates.push({
      def,
      key: def.key,
      title: def.title,
      system: def.system,
      memberTopicIds,
      requiredTopicIds: effectiveRequiredTopicIds,
      missingRequiredTopicIds,
      unavailableRequiredTopicIds,
    })
  }

  // Step 2 — fallback candidates from topics not claimed by curated groups.
  const fallbackCandidates = []
  const unclaimedBySection = new Map()
  const unclaimedWithoutSection = []
  for (const t of resolvedTopics) {
    if (!t.sourceTopicId || claimedByCurated.has(t.sourceTopicId)) continue
    if (t.groupId) {
      if (!unclaimedBySection.has(t.groupId)) unclaimedBySection.set(t.groupId, [])
      unclaimedBySection.get(t.groupId).push(t)
    } else {
      unclaimedWithoutSection.push(t)
    }
  }
  for (const [section, topics] of unclaimedBySection) {
    fallbackCandidates.push({
      key: fallbackSectionKey(section),
      title: section,
      system: 'uworld',
      memberTopicIds: topics.map(t => t.sourceTopicId),
      requiredTopicIds: topics.map(t => t.sourceTopicId),
      missingRequiredTopicIds: [],
      unavailableRequiredTopicIds: [],
    })
  }
  for (const t of unclaimedWithoutSection) {
    fallbackCandidates.push({
      key: fallbackTopicKey(t.sourceTopicId),
      title: t.title || t.sourceTopicId,
      system: 'uworld',
      memberTopicIds: [t.sourceTopicId],
      requiredTopicIds: [t.sourceTopicId],
      missingRequiredTopicIds: [],
      unavailableRequiredTopicIds: [],
    })
  }

  // Step 3 — validate exclusions against every candidate key.
  const candidateKeys = new Set([...curatedCandidates, ...fallbackCandidates].map(g => g.key))
  const seenInvalid = new Set()
  questionGroupExclusions.forEach((key, index) => {
    if (typeof key !== 'string' || !GROUP_KEY_PATTERN.test(key)) {
      if (!seenInvalid.has(key)) {
        seenInvalid.add(key)
        errors.push({
          code: 'UNKNOWN_QUESTION_GROUP',
          message: `Unknown question group: ${key}`,
          field: `questionGroupExclusions[${index}]`,
        })
      }
      return
    }
    if (!candidateKeys.has(key)) {
      if (!seenInvalid.has(key)) {
        seenInvalid.add(key)
        errors.push({
          code: 'UNKNOWN_QUESTION_GROUP',
          message: `Unknown question group: ${key}`,
          field: `questionGroupExclusions[${index}]`,
        })
      }
    }
  })
  if (errors.length > 0) {
    return { groups: [], incompleteQuestionGroups: [], sourceAdaptedQuestionGroups: [], errors }
  }

  // Step 4 — finalize snapshot groups, applying exclusions. Every built key is
  // defensive-checked against the allowed group-key charset.
  const groups = []
  const incompleteQuestionGroups = []
  let displayOrder = 0

  const finalize = (candidate) => {
    if (!GROUP_KEY_PATTERN.test(candidate.key)) {
      throw new Error(`Invalid question group key: ${candidate.key}`)
    }
    const excluded = exclusionSet.has(candidate.key) ? 1 : 0
    const snapshot = {
      key: candidate.key,
      title: candidate.title,
      system: candidate.system,
      targetQuestions: preferredQuestionsPerDay,
      memberTopicIds: candidate.memberTopicIds,
      requiredTopicIds: candidate.requiredTopicIds,
      excluded,
      displayOrder: displayOrder++,
    }
    groups.push(snapshot)
    if (excluded === 0 && candidate.missingRequiredTopicIds.length > 0) {
      incompleteQuestionGroups.push({
        key: candidate.key,
        title: candidate.title,
        system: candidate.system,
        targetQuestions: preferredQuestionsPerDay,
        memberTopicIds: candidate.memberTopicIds,
        requiredTopicIds: candidate.requiredTopicIds,
        missingRequiredTopicIds: candidate.missingRequiredTopicIds,
        missingRequiredTopicTitles: candidate.missingRequiredTopicIds.map(id => titleFor(id)),
      })
    }
  }

  for (const candidate of curatedCandidates) finalize(candidate)
  for (const candidate of fallbackCandidates) finalize(candidate)

  // Curated groups whose required topics are simply not covered by the selected
  // source+rotation. Informational only — never blocks preview/creation and is
  // not persisted as an obligation. Reported even when the group is excluded.
  const sourceAdaptedQuestionGroups = []
  for (const candidate of curatedCandidates) {
    if (candidate.unavailableRequiredTopicIds.length === 0) continue
    sourceAdaptedQuestionGroups.push({
      groupKey: candidate.key,
      title: candidate.title,
      unavailableRequiredTopicIds: candidate.unavailableRequiredTopicIds,
      unavailableRequiredTopicTitles: candidate.unavailableRequiredTopicIds.map(id => titleFor(id)),
    })
  }

  return { groups, incompleteQuestionGroups, sourceAdaptedQuestionGroups, errors }
}

// Maps incomplete question groups to their actionable missing topics so the
// create handler can gate on groups that are source-supported but unselected.
// Groups whose only missing required topics are unavailable in the source are
// filtered out (they are not actionable).
export function collectUnresolvedQuestionGroups(incompleteQuestionGroups) {
  return (incompleteQuestionGroups || [])
    .filter(g => (g.missingRequiredTopicIds || []).length > 0)
    .map(g => ({
      key: g.key,
      title: g.title,
      missingRequiredTopicIds: g.missingRequiredTopicIds,
      missingRequiredTopicTitles: g.missingRequiredTopicTitles || [],
    }))
}
