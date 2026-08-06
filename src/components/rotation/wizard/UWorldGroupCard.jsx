import styles from '../PlanCreationForm.module.css'

export default function UWorldGroupCard({
  group,
  isFallback = false,
  excluded = false,
  incomplete = null,
  adapted = null,
  preferredQuestionsPerDay = 0,
  topicTitleById = new Map(),
  children,
}) {
  const memberTopicIds = Array.isArray(group?.memberTopicIds) ? group.memberTopicIds : []
  const requiredTopicIds = Array.isArray(group?.requiredTopicIds) ? group.requiredTopicIds : []
  const memberTitles = memberTopicIds.map((id) => topicTitleById.get(id) || id)
  const requiredTitles = requiredTopicIds.map((id) => topicTitleById.get(id) || id)
  const missingTitles = Array.isArray(incomplete?.missingRequiredTopicTitles) ? incomplete.missingRequiredTopicTitles : []
  const unavailableTitles = Array.isArray(adapted?.unavailableRequiredTopicTitles) ? adapted.unavailableRequiredTopicTitles : []

  return (
    <article className={`${styles.groupCard} ${excluded ? styles.groupCardExcluded : ''}`}>
      <div className={styles.groupCardHeader}>
        <span className={styles.groupBadge}>UWorld review group</span>
        {excluded && <span className={styles.groupExcluded}>Excluded</span>}
      </div>

      <h4 className={styles.groupTitle}>{group?.title}</h4>

      {isFallback && (
        <p className={styles.groupHint}>Grouped by curriculum section — not an official UWorld grouping.</p>
      )}

      <div className={styles.groupRow}>
        <span className={styles.groupLabel}>Members ({memberTopicIds.length})</span>
        {memberTitles.length > 0 && (
          <ul className={styles.groupList}>
            {memberTitles.map((title, i) => (
              <li key={memberTopicIds[i]} className={styles.groupListItem}>{title}</li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.groupRow}>
        <span className={styles.groupLabel}>Required learning</span>
        {requiredTitles.length > 0 && (
          <ul className={styles.groupList}>
            {requiredTitles.map((title, i) => (
              <li key={requiredTopicIds[i]} className={styles.groupListItem}>{title}</li>
            ))}
          </ul>
        )}
      </div>

      <p className={styles.hint}>{preferredQuestionsPerDay} questions per review block</p>
      <p className={styles.groupHint}>
        UWorld questions unlock after you complete the required learning topics. Incorrect answers are reviewed after the group's questions are complete.
      </p>

      {incomplete && (
        <div className={styles.groupMissing}>
          <span className={styles.groupLabel}>Missing related topics:</span>
          {missingTitles.length > 0 && (
            <ul className={styles.groupList}>
              {missingTitles.map((title, i) => (
                <li key={i} className={styles.groupListItem}>{title}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adapted && (
        <div className={styles.groupNotCovered}>
          <span className={styles.groupLabel}>Not covered by this source:</span>
          {unavailableTitles.length > 0 && (
            <ul className={styles.groupList}>
              {unavailableTitles.map((title, i) => (
                <li key={i} className={styles.groupListItem}>{title}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {children}
    </article>
  )
}
