import styles from '../PlanCreationForm.module.css'

export default function StepPreview({ preview, previewLoading, previewError, onRetry }) {
  if (previewLoading) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.hint}>Generating preview...</p>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (previewError) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.errorText}>Failed to generate preview.</p>
        <p className={styles.hint}>{previewError.message || 'Unknown error'}</p>
        <button type="button" onClick={onRetry} className={styles.btnSmall}>Retry</button>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.hint}>No preview generated yet.</p>
        <button type="button" onClick={onRetry} className={styles.btnSmall}>Generate Preview</button>
      </div>
    )
  }

  const { feasibility, tasks, unscheduledWork, topicStates, possibleSolutions } = preview
  const feasible = feasibility?.feasible

  const taskCounts = (tasks || []).reduce((counts, task) => {
    counts[task.taskType] = (counts[task.taskType] ?? 0) + 1
    return counts
  }, {})

  return (
    <div className={styles.stepContent}>
      <div className={`${styles.feasibilityBanner} ${feasible ? styles.feasible : styles.infeasible}`}>
        {feasible ? 'Plan is feasible' : 'Plan exceeds available capacity'}
      </div>

      <div className={styles.summarySection}>
        <p className={styles.hint}>
          Required: {feasibility?.totalRequiredMinutes ?? 0} min |
          Available: {feasibility?.availableMinutes ?? 0} min |
          Missing: {feasibility?.missingCapacity ?? 0} min
        </p>
      </div>

      {feasibility?.topicsLeftUnscheduled?.length > 0 && (
        <div className={styles.summarySection}>
          <h4 className={styles.label}>Unscheduled Topics ({feasibility.topicsLeftUnscheduled.length})</h4>
          {feasibility.topicsLeftUnscheduled.map(id => (
            <p key={id} className={styles.hint}>{id}</p>
          ))}
        </div>
      )}

      {possibleSolutions?.length > 0 && (
        <div className={styles.summarySection}>
          <h4 className={styles.label}>Possible Solutions</h4>
          {possibleSolutions.map((sol, i) => (
            <p key={i} className={styles.hint}>{sol}</p>
          ))}
        </div>
      )}

      {Object.keys(taskCounts).length > 0 && (
        <div className={styles.summarySection}>
          <h4 className={styles.label}>Task Summary</h4>
          {Object.entries(taskCounts).map(([type, count]) => (
            <p key={type} className={styles.hint}>{type}: {count} tasks</p>
          ))}
        </div>
      )}

      {unscheduledWork?.length > 0 && (
        <div className={styles.summarySection}>
          <h4 className={styles.label}>Unscheduled Work</h4>
          {unscheduledWork.map(w => (
            <p key={w.canonicalTopicId} className={styles.hint}>
              {w.title}: {w.remainingLearningMinutes} min learning, {w.remainingQuestions} questions
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
