// Curated UWorld question groups for grouped UWorld scheduling.
//
// Each definition is system-agnostic about UWorld question totals: NO count is
// stored here. The per-group target is always derived server-side from the
// plan's preferredQuestionsPerDay (see questionGroupBuilder.js), so a curated
// group never claims official UWorld totals.
//
// memberTopicIds   — source topic ids (e.g. `cardiology.stable-angina-pectoris`)
//                    that make up the group when the user selects them.
// requiredTopicIds — subset of members whose learning must be completed before
//                    the group's UWorld review block unlocks.

const ARRHYTHMIA_TOPIC_IDS = [
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
]

export const UW_QUESTION_GROUP_SYSTEM = 'uworld'

export const CURATED_UWORLD_QUESTION_GROUPS = [
  {
    key: 'ischemic-heart-disease',
    title: 'Ischemic Heart Disease',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [
      'cardiology.stable-angina-pectoris',
      'cardiology.acute-coronary-syndromes-acs',
      'cardiology.variant-prinzmetal-angina',
    ],
    requiredTopicIds: [
      'cardiology.stable-angina-pectoris',
      'cardiology.acute-coronary-syndromes-acs',
    ],
  },
  {
    key: 'valvular-heart-disease',
    title: 'Valvular Heart Disease',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [
      'cardiology.mitral-stenosis',
      'cardiology.aortic-stenosis',
      'cardiology.aortic-regurgitation',
      'cardiology.mitral-regurgitation',
      'cardiology.tricuspid-regurgitation',
      'cardiology.mitral-valve-prolapse',
      'cardiology.rheumatic-heart-disease',
      'cardiology.infective-endocarditis',
      'cardiology.nonbacterial-thrombotic-endocarditis-marantic-endocarditis',
      'cardiology.nonbacterial-verrucous-endocarditis-libman-sacks-endocarditis',
    ],
    requiredTopicIds: [
      'cardiology.mitral-stenosis',
      'cardiology.aortic-stenosis',
      'cardiology.aortic-regurgitation',
      'cardiology.mitral-regurgitation',
    ],
  },
  {
    key: 'heart-failure',
    title: 'Heart Failure',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [
      'cardiology.congestive-heart-failure',
      'cardiology.acute-decompensated-heart-failure',
    ],
    requiredTopicIds: [
      'cardiology.congestive-heart-failure',
      'cardiology.acute-decompensated-heart-failure',
    ],
  },
  {
    key: 'arrhythmias',
    title: 'Arrhythmias',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [...ARRHYTHMIA_TOPIC_IDS],
    requiredTopicIds: [...ARRHYTHMIA_TOPIC_IDS],
  },
  {
    key: 'pericardial-disease',
    title: 'Pericardial Disease',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [
      'cardiology.acute-pericarditis',
      'cardiology.constrictive-pericarditis',
      'cardiology.pericardial-effusion',
      'cardiology.cardiac-tamponade',
    ],
    requiredTopicIds: [
      'cardiology.acute-pericarditis',
      'cardiology.constrictive-pericarditis',
      'cardiology.pericardial-effusion',
      'cardiology.cardiac-tamponade',
    ],
  },
  {
    key: 'congenital-heart-disease',
    title: 'Congenital Heart Disease',
    system: UW_QUESTION_GROUP_SYSTEM,
    memberTopicIds: [
      'cardiology.atrial-septal-defect',
      'cardiology.ventricular-septal-defect',
      'cardiology.coarctation-of-the-aorta',
      'cardiology.patent-ductus-arteriosus',
      'cardiology.tetralogy-of-fallot',
    ],
    requiredTopicIds: [
      'cardiology.atrial-septal-defect',
      'cardiology.ventricular-septal-defect',
      'cardiology.coarctation-of-the-aorta',
      'cardiology.patent-ductus-arteriosus',
      'cardiology.tetralogy-of-fallot',
    ],
  },
]

const CURATED_BY_KEY = new Map(CURATED_UWORLD_QUESTION_GROUPS.map(g => [g.key, g]))

export function getCuratedUworldGroups() {
  return CURATED_UWORLD_QUESTION_GROUPS
}

export function getCuratedUworldGroupByKey(key) {
  return CURATED_BY_KEY.get(key) || null
}
