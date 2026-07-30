import { getLearningMinutesForStyle } from './buildPlanRequest'
import styles from '../PlanCreationForm.module.css'

export default function StepReviewTopics({ form, topics }) {
  const totalMinutes = topics.reduce((sum, t) => sum + getLearningMinutesForStyle(t, form.studyStyle), 0)

  return (
    <div className={styles.stepContent}>
      <p className={styles.label}>Review Topics ({topics.length})</p>
      <div className={styles.topicList}>
        {topics.map(t => {
          const mins = getLearningMinutesForStyle(t, form.studyStyle)
          return (
            <div key={t.normalizedTopicId} className={styles.topicRow}>
              <span className={styles.topicTitle}>{t.title}</span>
              {t.groupId && <span className={styles.topicBadge}>{t.groupId}</span>}
              {t.sharedTopicKey && <span className={styles.topicBadge}>shared</span>}
              <span className={styles.topicMinutes}>{mins} min</span>
            </div>
          )
        })}
      </div>
      <p className={styles.hint}>Total: {totalMinutes} minutes ({Math.round(totalMinutes / 60 * 10) / 10} hrs)</p>
    </div>
  )
}
