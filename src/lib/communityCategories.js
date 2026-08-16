import { BookOpen, Stethoscope, GraduationCap, Brain, Pill, FlaskConical, Heart } from 'lucide-react'

export const CATEGORY_CONFIG = {
  general: { label: 'General', icon: BookOpen, color: 'var(--blue)' },
  clinical: { label: 'Clinical', icon: Stethoscope, color: 'var(--emerald)' },
  exam_prep: { label: 'Exam Prep', icon: GraduationCap, color: '#F59E0B' },
  anatomy: { label: 'Anatomy', icon: Brain, color: '#8B5CF6' },
  pharmacology: { label: 'Pharmacology', icon: Pill, color: '#EC4899' },
  pathology: { label: 'Pathology', icon: FlaskConical, color: '#EF4444' },
  research: { label: 'Research', icon: FlaskConical, color: '#06B6D4' },
  wellness: { label: 'Wellness', icon: Heart, color: '#F97316' },
}

export const SORT_OPTIONS = [
  { value: 'members', label: 'Most Members' },
  { value: 'created', label: 'Newest' },
  { value: 'activity', label: 'Most Active' },
]
