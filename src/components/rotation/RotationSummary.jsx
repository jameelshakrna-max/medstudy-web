import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { CalendarRange, Clock, BookOpen, Target, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import styles from './RotationSummary.module.css'

export default function RotationSummary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const { data: plans, isLoading } = useQuery({
    queryKey: queryKeys.rotations.plans(),
    queryFn: () => apiGet('/rotations/plans'),
    enabled: !!user,
  })
  
  const activePlan = plans?.find(p => p.status === 'active')
  
  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!activePlan) return (
    <div className={styles.empty}>
      <CalendarRange size={32} strokeWidth={1.5} />
      <p>No active rotation plan</p>
      <button className={styles.linkBtn} onClick={() => navigate('/rotations')}>
        Create one <ChevronRight size={14} />
      </button>
    </div>
  )
  
  // Calculate days remaining
  const endDate = new Date(activePlan.end_date)
  const today = new Date()
  const daysRemaining = Math.max(0, Math.ceil((endDate - today) / 86400000))
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <CalendarRange size={18} />
          <span>{activePlan.name}</span>
        </div>
        <span className={styles.badge}>{activePlan.rotation}</span>
      </div>
      
      <div className={styles.stats}>
        <div className={styles.stat}>
          <Clock size={14} />
          <span>{daysRemaining} days left</span>
        </div>
        <div className={styles.stat}>
          <Target size={14} />
          <span>{activePlan.uworld_total_questions} UWorld Qs</span>
        </div>
        <div className={styles.stat}>
          <BookOpen size={14} />
          <span>{activePlan.study_style} study</span>
        </div>
      </div>
      
      <div className={styles.dates}>
        {activePlan.start_date} → {activePlan.end_date}
      </div>
      
      <button className={styles.viewBtn} onClick={() => navigate('/rotations')}>
        View Full Planner <ChevronRight size={14} />
      </button>
    </div>
  )
}