export const SUBJECT_COLORS = {
  cardiology: '#EF4444',
  respiratory: '#3B82F6',
  gastroenterology: '#10B981',
  nephrology: '#F59E0B',
  neurology: '#8B5CF6',
  endocrinology: '#EC4899',
  infectious: '#14B8A6',
  hematology: '#F97316',
  oncology: '#6366F1',
  rheumatology: '#A855F7',
  dermatology: '#EAB308',
  psychiatry: '#06B6D4',
  obgyn: '#D946EF',
  pediatrics: '#22C55E',
  emergency: '#FB923C',
  mixed: '#8899AA',
  self_assessment: '#818CF8',
  other: '#64748B',
}

export function getSubjectColor(id) {
  return SUBJECT_COLORS[id] || '#64748B'
}

export function getSubjectName(id) {
  const names = {
    cardiology: 'Cardiology',
    respiratory: 'Respiratory',
    gastroenterology: 'Gastroenterology',
    nephrology: 'Nephrology',
    neurology: 'Neurology',
    endocrinology: 'Endocrinology',
    infectious: 'Infectious Disease',
    hematology: 'Hematology',
    oncology: 'Oncology',
    rheumatology: 'Rheumatology',
    dermatology: 'Dermatology',
    psychiatry: 'Psychiatry',
    obgyn: 'Obstetrics & Gynecology',
    pediatrics: 'Pediatrics',
    emergency: 'Emergency Medicine',
    mixed: 'Mixed',
    self_assessment: 'Self Assessment',
    other: 'Other',
  }
  return names[id] || id || 'Unknown'
}
