import { CURATED_UWORLD_QUESTION_GROUPS } from '../../data/uworldQuestionGroups/index.js'

const GROUP_KEY_PATTERN = /^[a-z0-9][a-z0-9.-]*$/

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
export function buildQuestionGroups({ resolvedTopics, preferredQuestionsPerDay, questionGroupExclusions = [] }) {
  const errors = []
  const exclusionSet = new Set(questionGroupExclusions)

  const resolvedById = new Map()
  for (const t of resolvedTopics) {
    if (t.sourceTopicId) resolvedById.set(t.sourceTopicId, t)
  }

  // Step 1 — curated candidates (before exclusions so every selectable group is
  // a valid exclusion target).
  const curatedCandidates = []
  const claimedByCurated = new Set()
  for (const def of CURATED_UWORLD_QUESTION_GROUPS) {
    const memberTopicIds = def.memberTopicIds.filter(id => resolvedById.has(id))
    if (memberTopicIds.length === 0) continue
    for (const id of memberTopicIds) claimedByCurated.add(id)
    const requiredTopicIds = def.requiredTopicIds.filter(id => resolvedById.has(id))
    const missingRequiredTopicIds = def.requiredTopicIds.filter(id => !resolvedById.has(id))
    curatedCandidates.push({
      def,
      key: def.key,
      title: def.title,
      system: def.system,
      memberTopicIds,
      requiredTopicIds,
      missingRequiredTopicIds,
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
    return { groups: [], incompleteQuestionGroups: [], errors }
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
      })
    }
  }

  for (const candidate of curatedCandidates) finalize(candidate)
  for (const candidate of fallbackCandidates) finalize(candidate)

  return { groups, incompleteQuestionGroups, errors }
}
