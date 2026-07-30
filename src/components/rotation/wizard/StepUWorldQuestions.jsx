import { useState } from 'react'
import styles from '../PlanCreationForm.module.css'

export default function StepUWorldQuestions({ form, onFormChange }) {
  const [batchValue, setBatchValue] = useState('')

  function updateTopic(index, field, value) {
    const num = Math.max(0, parseInt(value, 10) || 0)
    const newTopics = form.topics.map((t, i) =>
      i === index ? { ...t, [field]: num } : t
    )
    onFormChange({ topics: newTopics })
  }

  function applyBatch() {
    const num = Math.max(0, parseInt(batchValue, 10) || 0)
    const newTopics = form.topics.map(t => ({ ...t, uworldRemainingQuestions: num }))
    onFormChange({ topics: newTopics })
    setBatchValue('')
  }

  const totalQuestions = form.topics.reduce((sum, t) => sum + (t.uworldRemainingQuestions || 0), 0)
  const topicsWithQuestions = form.topics.filter(t => t.uworldRemainingQuestions > 0).length

  return (
    <div className={styles.stepContent}>
      <p className={styles.hint}>{topicsWithQuestions} of {form.topics.length} topics with questions, {totalQuestions} total</p>

      <div className={styles.batchRow}>
        <label className={styles.label}>Set all topics to:</label>
        <input
          type="number"
          min="0"
          value={batchValue}
          onChange={e => setBatchValue(e.target.value)}
          className={styles.inputSmall}
          placeholder="0"
        />
        <button type="button" onClick={applyBatch} className={styles.btnSmall}>Apply</button>
      </div>

      <div className={styles.topicList}>
        {form.topics.map((t, i) => (
          <div key={t.normalizedTopicId} className={styles.topicRow}>
            <div className={styles.topicInfo}>
              <span className={styles.topicTitle}>{t.title || t.normalizedTopicId}</span>
              {t.title && t.title !== t.normalizedTopicId && (
                <span className={styles.topicSubtitle}>{t.normalizedTopicId}</span>
              )}
            </div>
            <div className={styles.topicStats}>
              <span className={styles.topicCount}>{t.uworldRemainingQuestions || 0} Q</span>
              <input
                type="number"
                min="0"
                value={t.uworldRemainingQuestions}
                onChange={e => updateTopic(i, 'uworldRemainingQuestions', e.target.value)}
                className={styles.inputSmall}
              />
            </div>
          </div>
        ))}
      </div>

      <p className={styles.hint}>Total UWorld questions: {totalQuestions}</p>
    </div>
  )
}
