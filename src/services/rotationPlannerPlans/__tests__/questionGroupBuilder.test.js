import { describe, it, expect } from 'vitest'
import { buildQuestionGroups, collectUnresolvedQuestionGroups } from '../questionGroupBuilder.js'
import { CURATED_UWORLD_QUESTION_GROUPS } from '../../../data/uworldQuestionGroups/index.js'

function makeTopic(sourceTopicId, groupId, title) {
  return {
    sourceTopicId,
    groupId,
    title: title || sourceTopicId,
    normalizedTopicId: `step-up-medicine-6e-2024::cardiology::${sourceTopicId.replace('cardiology.', '')}`,
  }
}

const FULL_CARDIOLOGY_TOPIC_IDS = [
  'cardiology.chest-pain',
  'cardiology.stable-angina-pectoris',
  'cardiology.acute-coronary-syndromes-acs',
  'cardiology.variant-prinzmetal-angina',
  'cardiology.congestive-heart-failure',
  'cardiology.acute-decompensated-heart-failure',
  'cardiology.arrhythmias-terminology',
  'cardiology.premature-complexes',
  'cardiology.atrial-fibrillation',
  'cardiology.atrial-flutter',
  'cardiology.multifocal-atrial-tachycardia',
  'cardiology.paroxysmal-supraventricular-tachycardia',
  'cardiology.wolff-parkinson-white-wpw-syndrome',
  'cardiology.ventricular-tachycardia',
  'cardiology.ventricular-fibrillation',
  'cardiology.sinus-bradycardia',
  'cardiology.sick-sinus-syndrome',
  'cardiology.av-block',
  'cardiology.acute-pericarditis',
  'cardiology.constrictive-pericarditis',
  'cardiology.pericardial-effusion',
  'cardiology.cardiac-tamponade',
  'cardiology.mitral-stenosis',
  'cardiology.aortic-stenosis',
  'cardiology.aortic-regurgitation',
  'cardiology.mitral-regurgitation',
  'cardiology.atrial-septal-defect',
  'cardiology.ventricular-septal-defect',
  'cardiology.coarctation-of-the-aorta',
  'cardiology.patent-ductus-arteriosus',
  'cardiology.tetralogy-of-fallot',
  'cardiology.hypertensive-emergency',
  'cardiology.aortic-dissection',
]

const SECTIONS = {
  'cardiology.chest-pain': 'Chest Pain',
  'cardiology.stable-angina-pectoris': 'Ischemic Heart Disease',
  'cardiology.acute-coronary-syndromes-acs': 'Ischemic Heart Disease',
  'cardiology.variant-prinzmetal-angina': 'Ischemic Heart Disease',
  'cardiology.congestive-heart-failure': 'Congestive Heart Failure',
  'cardiology.acute-decompensated-heart-failure': 'Congestive Heart Failure',
  'cardiology.arrhythmias-terminology': 'Arrhythmias',
  'cardiology.premature-complexes': 'Arrhythmias',
  'cardiology.atrial-fibrillation': 'Tachyarrhythmias',
  'cardiology.atrial-flutter': 'Tachyarrhythmias',
  'cardiology.multifocal-atrial-tachycardia': 'Tachyarrhythmias',
  'cardiology.paroxysmal-supraventricular-tachycardia': 'Tachyarrhythmias',
  'cardiology.wolff-parkinson-white-wpw-syndrome': 'Tachyarrhythmias',
  'cardiology.ventricular-tachycardia': 'Tachyarrhythmias',
  'cardiology.ventricular-fibrillation': 'Tachyarrhythmias',
  'cardiology.sinus-bradycardia': 'Bradyarrhythmias',
  'cardiology.sick-sinus-syndrome': 'Bradyarrhythmias',
  'cardiology.av-block': 'Bradyarrhythmias',
  'cardiology.acute-pericarditis': 'Pericardial Diseases',
  'cardiology.constrictive-pericarditis': 'Pericardial Diseases',
  'cardiology.pericardial-effusion': 'Pericardial Diseases',
  'cardiology.cardiac-tamponade': 'Pericardial Diseases',
  'cardiology.mitral-stenosis': 'Valvular Heart Disease',
  'cardiology.aortic-stenosis': 'Valvular Heart Disease',
  'cardiology.aortic-regurgitation': 'Valvular Heart Disease',
  'cardiology.mitral-regurgitation': 'Valvular Heart Disease',
  'cardiology.atrial-septal-defect': 'Congenital Heart Disease',
  'cardiology.ventricular-septal-defect': 'Congenital Heart Disease',
  'cardiology.coarctation-of-the-aorta': 'Congenital Heart Disease',
  'cardiology.patent-ductus-arteriosus': 'Congenital Heart Disease',
  'cardiology.tetralogy-of-fallot': 'Congenital Heart Disease',
  'cardiology.hypertensive-emergency': 'Diseases of the Vasculature',
  'cardiology.aortic-dissection': 'Diseases of the Vasculature',
}

function fullTopics() {
  return FULL_CARDIOLOGY_TOPIC_IDS.map(id => makeTopic(id, SECTIONS[id]))
}

// Every source-supported topic for a cardiology rotation. Passing this set to
// buildQuestionGroups lets the builder classify required topics as
// source-supported (selectable) vs unavailable in the source.
const SUPPORTED_CARDIOLOGY_TOPICS = fullTopics()

function heartFailureTopics() {
  return [
    makeTopic('cardiology.congestive-heart-failure', 'Congestive Heart Failure', 'Congestive Heart Failure'),
    makeTopic('cardiology.acute-decompensated-heart-failure', 'Congestive Heart Failure', 'Acute Decompensated Heart Failure'),
  ]
}

function acuteDecompensatedHeartFailureTopic() {
  return makeTopic('cardiology.acute-decompensated-heart-failure', 'Congestive Heart Failure', 'Acute Decompensated Heart Failure')
}

describe('buildQuestionGroups', () => {
  it('forms all curated groups when their members are selected', () => {
    const { groups, incompleteQuestionGroups, errors } = buildQuestionGroups({
      resolvedTopics: fullTopics(),
      preferredQuestionsPerDay: 30,
    })
    expect(errors).toEqual([])
    expect(incompleteQuestionGroups).toEqual([])
    const keys = groups.map(g => g.key)
    expect(keys).toContain('ischemic-heart-disease')
    expect(keys).toContain('valvular-heart-disease')
    expect(keys).toContain('heart-failure')
    expect(keys).toContain('arrhythmias')
    expect(keys).toContain('pericardial-disease')
    expect(keys).toContain('congenital-heart-disease')
  })

  it('sets targetQuestions to preferredQuestionsPerDay for every group', () => {
    const { groups } = buildQuestionGroups({ resolvedTopics: fullTopics(), supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS, preferredQuestionsPerDay: 25 })
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) expect(g.targetQuestions).toBe(25)
  })

  it('uses registry required topics for ischemic heart disease', () => {
    const { groups } = buildQuestionGroups({ resolvedTopics: fullTopics(), supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS, preferredQuestionsPerDay: 30 })
    const ischemic = groups.find(g => g.key === 'ischemic-heart-disease')
    expect(ischemic.memberTopicIds).toEqual([
      'cardiology.stable-angina-pectoris',
      'cardiology.acute-coronary-syndromes-acs',
      'cardiology.variant-prinzmetal-angina',
    ])
    expect(ischemic.requiredTopicIds).toEqual([
      'cardiology.stable-angina-pectoris',
      'cardiology.acute-coronary-syndromes-acs',
    ])
  })

  it('does not form groups with zero selected members', () => {
    const { groups } = buildQuestionGroups({
      resolvedTopics: [makeTopic('cardiology.congestive-heart-failure', 'Congestive Heart Failure')],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
    })
    const keys = groups.map(g => g.key)
    expect(keys).toContain('heart-failure')
    expect(keys).not.toContain('ischemic-heart-disease')
    expect(keys).not.toContain('valvular-heart-disease')
  })

  it('flags included groups whose required topics are missing', () => {
    const { groups, incompleteQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [
        makeTopic('cardiology.variant-prinzmetal-angina', 'Ischemic Heart Disease'),
      ],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
    })
    expect(incompleteQuestionGroups).toHaveLength(1)
    expect(incompleteQuestionGroups[0].key).toBe('ischemic-heart-disease')
    expect(incompleteQuestionGroups[0].missingRequiredTopicIds).toEqual([
      'cardiology.stable-angina-pectoris',
      'cardiology.acute-coronary-syndromes-acs',
    ])
    expect(groups.find(g => g.key === 'ischemic-heart-disease').excluded).toBe(0)
  })

  it('excluded groups are persisted with excluded=1 and never flagged incomplete', () => {
    const { groups, incompleteQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [makeTopic('cardiology.variant-prinzmetal-angina', 'Ischemic Heart Disease')],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['ischemic-heart-disease'],
    })
    expect(incompleteQuestionGroups).toEqual([])
    expect(groups.find(g => g.key === 'ischemic-heart-disease').excluded).toBe(1)
  })

  it('rejects unknown exclusions with UNKNOWN_QUESTION_GROUP', () => {
    const { groups, errors } = buildQuestionGroups({
      resolvedTopics: fullTopics(),
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['does-not-exist'],
    })
    expect(groups).toEqual([])
    expect(errors.some(e => e.code === 'UNKNOWN_QUESTION_GROUP')).toBe(true)
  })

  it('rejects exclusion keys with invalid group-key characters', () => {
    const { errors } = buildQuestionGroups({
      resolvedTopics: fullTopics(),
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['Ischemic Heart Disease!'],
    })
    expect(errors.some(e => e.code === 'UNKNOWN_QUESTION_GROUP')).toBe(true)
  })

  it('builds a fallback group from unclaimed topics in the same curriculum section', () => {
    const { groups } = buildQuestionGroups({
      resolvedTopics: [
        makeTopic('cardiology.hypertensive-emergency', 'Diseases of the Vasculature'),
        makeTopic('cardiology.aortic-dissection', 'Diseases of the Vasculature'),
      ],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
    })
    const fallback = groups.find(g => g.key === 'fallback-diseases-of-the-vasculature')
    expect(fallback).toBeDefined()
    expect(fallback.memberTopicIds).toEqual([
      'cardiology.hypertensive-emergency',
      'cardiology.aortic-dissection',
    ])
  })

  it('builds a per-topic fallback group for topics without a usable section', () => {
    const { groups } = buildQuestionGroups({
      resolvedTopics: [makeTopic('cardiology.lone-topic', null)],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('fallback-cardiology-lone-topic')
  })

  it('allows excluding fallback groups', () => {
    const { groups } = buildQuestionGroups({
      resolvedTopics: [
        makeTopic('cardiology.hypertensive-emergency', 'Diseases of the Vasculature'),
        makeTopic('cardiology.aortic-dissection', 'Diseases of the Vasculature'),
      ],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['fallback-diseases-of-the-vasculature'],
    })
    expect(groups.find(g => g.key === 'fallback-diseases-of-the-vasculature').excluded).toBe(1)
  })

  it('topics claimed by a curated group never fall back, even when excluded', () => {
    const { groups } = buildQuestionGroups({
      resolvedTopics: [
        makeTopic('cardiology.stable-angina-pectoris', 'Ischemic Heart Disease'),
        makeTopic('cardiology.chest-pain', 'Chest Pain'),
      ],
      supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS,
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['ischemic-heart-disease'],
    })
    const keys = groups.map(g => g.key)
    expect(keys).toContain('ischemic-heart-disease')
    expect(keys).not.toContain('fallback-ischemic-heart-disease')
    expect(keys).toContain('fallback-chest-pain')
  })

  it('all built group keys match the allowed charset', () => {
    const { groups } = buildQuestionGroups({ resolvedTopics: fullTopics(), supportedTopics: SUPPORTED_CARDIOLOGY_TOPICS, preferredQuestionsPerDay: 30 })
    const pattern = /^[a-z0-9][a-z0-9.-]*$/
    for (const g of groups) expect(g.key).toMatch(pattern)
  })

  it('every curated key in the registry matches the allowed charset', () => {
    const pattern = /^[a-z0-9][a-z0-9.-]*$/
    for (const def of CURATED_UWORLD_QUESTION_GROUPS) expect(def.key).toMatch(pattern)
  })
})

describe('buildQuestionGroups — source-adapted required topics', () => {
  it('flags heart-failure incomplete when CHF is source-supported but unselected, without marking it source-adapted', () => {
    const { incompleteQuestionGroups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [acuteDecompensatedHeartFailureTopic()],
      supportedTopics: heartFailureTopics(),
      preferredQuestionsPerDay: 30,
    })
    const incomplete = incompleteQuestionGroups.find(g => g.key === 'heart-failure')
    expect(incomplete).toBeDefined()
    expect(incomplete.missingRequiredTopicIds).toEqual(['cardiology.congestive-heart-failure'])
    expect(incomplete.missingRequiredTopicTitles.length).toBeGreaterThan(0)
    expect(sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')).toBeUndefined()
  })

  it('source-adapted group: CHF unavailable in source, heart-failure not incomplete and required list excludes the unavailable topic', () => {
    const adhf = acuteDecompensatedHeartFailureTopic()
    const { groups, incompleteQuestionGroups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [adhf],
      supportedTopics: [adhf],
      preferredQuestionsPerDay: 30,
    })
    expect(incompleteQuestionGroups.find(g => g.key === 'heart-failure')).toBeUndefined()

    const adapted = sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')
    expect(adapted).toBeDefined()
    expect(adapted.unavailableRequiredTopicIds).toEqual(['cardiology.congestive-heart-failure'])
    expect(adapted.unavailableRequiredTopicTitles).not.toEqual(['cardiology.congestive-heart-failure'])
    expect(adapted.unavailableRequiredTopicTitles).toEqual(['Congestive Heart Failure'])

    const hf = groups.find(g => g.key === 'heart-failure')
    expect(hf).toBeDefined()
    expect(hf.requiredTopicIds).toEqual(['cardiology.acute-decompensated-heart-failure'])
    expect(hf.excluded).toBe(0)
  })

  it('collectUnresolvedQuestionGroups returns [] for a fully source-adapted group and non-empty for an actionable group', () => {
    const adhf = acuteDecompensatedHeartFailureTopic()
    const sourceAdapted = buildQuestionGroups({
      resolvedTopics: [adhf],
      supportedTopics: [adhf],
      preferredQuestionsPerDay: 30,
    })
    expect(collectUnresolvedQuestionGroups(sourceAdapted.incompleteQuestionGroups)).toEqual([])

    const actionable = buildQuestionGroups({
      resolvedTopics: [adhf],
      supportedTopics: heartFailureTopics(),
      preferredQuestionsPerDay: 30,
    })
    const unresolved = collectUnresolvedQuestionGroups(actionable.incompleteQuestionGroups)
    expect(unresolved.length).toBe(1)
    expect(unresolved[0]).toMatchObject({ key: 'heart-failure', title: 'Heart Failure' })
    expect(unresolved[0].missingRequiredTopicIds).toEqual(['cardiology.congestive-heart-failure'])
  })

  it('groups with both selectable-missing and unavailable-missing required topics appear in both lists, disjoint', () => {
    const arrhythmiaDef = CURATED_UWORLD_QUESTION_GROUPS.find(g => g.key === 'arrhythmias')
    const supportedIds = arrhythmiaDef.requiredTopicIds.filter(id => id !== 'cardiology.wolff-parkinson-white-wpw-syndrome')
    const unselectedIds = ['cardiology.arrhythmias-terminology', 'cardiology.premature-complexes']
    const selectedIds = supportedIds.filter(id => !unselectedIds.includes(id))

    const supportedTopics = supportedIds.map(id => makeTopic(id, 'Arrhythmias', `Title: ${id}`))
    const resolvedTopics = selectedIds.map(id => makeTopic(id, 'Arrhythmias', `Title: ${id}`))

    const { incompleteQuestionGroups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics,
      supportedTopics,
      preferredQuestionsPerDay: 30,
    })

    const incomplete = incompleteQuestionGroups.find(g => g.key === 'arrhythmias')
    expect(incomplete).toBeDefined()
    expect(incomplete.missingRequiredTopicIds).toEqual(unselectedIds)

    const adapted = sourceAdaptedQuestionGroups.find(g => g.groupKey === 'arrhythmias')
    expect(adapted).toBeDefined()
    expect(adapted.unavailableRequiredTopicIds).toEqual(['cardiology.wolff-parkinson-white-wpw-syndrome'])

    const missingSet = new Set(incomplete.missingRequiredTopicIds)
    const unavailableSet = new Set(adapted.unavailableRequiredTopicIds)
    expect([...missingSet].some(id => unavailableSet.has(id))).toBe(false)
  })

  it('fully supported curated group retains the original requiredTopicIds', () => {
    const def = CURATED_UWORLD_QUESTION_GROUPS.find(g => g.key === 'heart-failure')
    const supportedTopics = heartFailureTopics()
    const resolvedTopics = supportedTopics.map(t => ({ ...t }))
    const { groups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics,
      supportedTopics,
      preferredQuestionsPerDay: 30,
    })
    const hf = groups.find(g => g.key === 'heart-failure')
    expect(hf.requiredTopicIds).toEqual(def.requiredTopicIds)
    expect(sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')).toBeUndefined()
  })

  it('source-adapted valid group can still be excluded', () => {
    const adhf = acuteDecompensatedHeartFailureTopic()
    const { groups, incompleteQuestionGroups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [adhf],
      supportedTopics: [adhf],
      preferredQuestionsPerDay: 30,
      questionGroupExclusions: ['heart-failure'],
    })
    const hf = groups.find(g => g.key === 'heart-failure')
    expect(hf.excluded).toBe(1)
    expect(incompleteQuestionGroups).toEqual([])
    expect(sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')).toBeDefined()
  })

  it('a source-adapted curated group does not swallow unclaimed topics into fallback groups', () => {
    const adhf = acuteDecompensatedHeartFailureTopic()
    const chestPain = makeTopic('cardiology.chest-pain', 'Chest Pain', 'Chest Pain')
    const { groups, sourceAdaptedQuestionGroups } = buildQuestionGroups({
      resolvedTopics: [adhf, chestPain],
      supportedTopics: [adhf, chestPain],
      preferredQuestionsPerDay: 30,
    })
    const keys = groups.map(g => g.key)
    expect(keys).toContain('heart-failure')
    expect(keys).toContain('fallback-chest-pain')
    expect(sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')).toBeDefined()
  })
})
