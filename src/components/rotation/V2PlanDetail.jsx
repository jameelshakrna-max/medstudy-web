import { useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs/Tabs'
import LoadingScreen from '../LoadingScreen'
import useRotationPlanDetail from './today/useRotationPlanDetail'
import TodayView from './today/TodayView'
import RecalculationBanner from './today/RecalculationBanner'
import styles from './V2PlanDetail.module.css'

export default function V2PlanDetail({ planId, onBack }) {
  const { data, isLoading, error } = useRotationPlanDetail(planId)

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading plan details..." />

  if (error) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div className={styles.error}>Failed to load plan. Please try again.</div>
      </div>
    )
  }

  const { plan, tasks, schedule, progress } = data

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <ChevronLeft size={18} /> Plans
        </button>
        <div>
          <h1 className={styles.title}>{plan.sourceTitle || 'Rotation Plan'}</h1>
          <div className={styles.meta}>
            {plan.topicCount > 0 && <span>{plan.topicCount} topics</span>}
            {plan.taskCount > 0 && <span>{plan.taskCount} tasks</span>}
            {plan.schedulingMode && <span className={styles.mode}>{plan.schedulingMode}</span>}
          </div>
        </div>
      </div>

      <RecalculationBanner
        planId={planId}
        lastRecalculatedAt={plan.lastRecalculatedAt}
        revision={plan.revision}
      />

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <TodayView planId={planId} tasks={tasks} plan={plan} />
        </TabsContent>
        <TabsContent value="schedule">
          <div className={styles.tabPlaceholder}>Schedule view coming soon</div>
        </TabsContent>
        <TabsContent value="topics">
          <div className={styles.tabPlaceholder}>Topics view coming soon</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
