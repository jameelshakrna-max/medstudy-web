export const GOAL_TEMPLATES = [
  { title: 'Complete 2000 Questions', goal_type: 'questions', target_value: 2000, category: 'long_term' },
  { title: 'Finish MRCP Syllabus', goal_type: 'topics', target_value: 150, category: 'long_term', module: 'MRCP' },
  { title: '30-Day Study Streak', goal_type: 'streak', target_value: 30, category: 'long_term' },
  { title: 'Study 1 Hour Daily', goal_type: 'hours', target_value: 1, category: 'daily' },
  { title: 'Master 100 Board Cases', goal_type: 'cases', target_value: 100, category: 'long_term' },
  { title: 'Reach 75% Average', goal_type: 'performance', target_value: 75, category: 'long_term' },
  { title: 'Pass 50 UWorld Blocks', goal_type: 'blocks', target_value: 50, category: 'long_term' },
  { title: 'Score 80% in Cardiology', goal_type: 'subject_avg', target_value: 80, category: 'long_term', subject_id: 'cardiology' },
]

export const GOAL_TYPE_OPTIONS = [
  { value: 'questions', label: 'Questions', desc: 'Total UWorld questions completed' },
  { value: 'blocks', label: 'Blocks', desc: 'Total UWorld blocks completed' },
  { value: 'topics', label: 'Topics', desc: 'MRCP topics mastered' },
  { value: 'cases', label: 'Cases', desc: 'Local Board cases reviewed' },
  { value: 'hours', label: 'Hours', desc: 'Total study hours' },
  { value: 'streak', label: 'Study Streak', desc: 'Consecutive study days' },
  { value: 'subject_avg', label: 'Subject Average', desc: 'Average score in a subject (requires deadline)' },
  { value: 'performance', label: 'Performance Score', desc: 'Overall performance score (requires deadline)' },
]

export const CATEGORY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'long_term', label: 'Long-Term' },
]

export const SUBJECT_OPTIONS = [
  { value: 'cardiology', label: 'Cardiology' },
  { value: 'respiratory', label: 'Respiratory' },
  { value: 'gastroenterology', label: 'Gastroenterology' },
  { value: 'nephrology', label: 'Nephrology' },
  { value: 'neurology', label: 'Neurology' },
  { value: 'endocrinology', label: 'Endocrinology' },
  { value: 'infectious', label: 'Infectious Disease' },
  { value: 'hematology', label: 'Hematology' },
  { value: 'oncology', label: 'Oncology' },
  { value: 'rheumatology', label: 'Rheumatology' },
  { value: 'dermatology', label: 'Dermatology' },
  { value: 'psychiatry', label: 'Psychiatry' },
  { value: 'obgyn', label: 'Obstetrics & Gynecology' },
  { value: 'pediatrics', label: 'Pediatrics' },
  { value: 'emergency', label: 'Emergency Medicine' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'self_assessment', label: 'Self Assessment' },
  { value: 'other', label: 'Other' },
]

export const MODULE_OPTIONS = [
  { value: 'UWorld', label: 'UWorld' },
  { value: 'MRCP', label: 'MRCP' },
  { value: 'Local Board', label: 'Local Board' },
]
