import { useMemo, useState } from 'react'
import styles from '../PlanCreationForm.module.css'
import Modal from '../../ui/Modal/Modal'
import UWorldGroupCard from './UWorldGroupCard'

export default function StepUWorldQuestions({
  form,
  preview,
  previewLoading,
  previewError,
  allTopics,
  onRegeneratePreview,
  onAddRelatedTopics,
  onExcludeGroup,
  onUndoExclusion,
}) {
  const [confirm, setConfirm] = useState({ open: false, key: null })

  const topicTitleById = useMemo(() => {
    const map = new Map()
    for (const t of form.topics || []) {
      if (t.sourceTopicId != null) map.set(t.sourceTopicId, t.title)
    }
    for (const t of allTopics || []) {
      if (t.sourceTopicId != null && !map.has(t.sourceTopicId)) map.set(t.sourceTopicId, t.title)
    }
    return map
  }, [form.topics, allTopics])

  if (previewLoading && !preview) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.hint}>Generating UWorld review groups...</p>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (previewError && !preview) {
    return (
      <div className={styles.stepContent}>
        <p className={styles.errorText}>Failed to generate UWorld review groups.</p>
        <p className={styles.hint}>{previewError.message || 'Unknown error'}</p>
        <button type="button" onClick={onRegeneratePreview} className={styles.btnSmall}>Retry</button>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className={styles.stepContent}>
        <h3 className={styles.label}>UWorld Review Groups</h3>
        <p className={styles.hint}>Questions are scheduled after you complete the related learning topics.</p>
        <button type="button" onClick={onRegeneratePreview} className={styles.btnPrimary}>Generate UWorld Groups</button>
      </div>
    )
  }

  const groups = [...(preview.questionGroups || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

  return (
    <div className={styles.stepContent}>
      <h3 className={styles.label}>UWorld Review Groups</h3>
      <p className={styles.hint}>Questions are scheduled after you complete the related learning topics.</p>

      {previewLoading && <p className={styles.regeneratingNote}>Regenerating...</p>}

      {groups.length === 0 ? (
        <p className={styles.hint}>No UWorld review groups found for these topics.</p>
      ) : (
        groups.map((group) => {
          const isFallback = group.key.startsWith('fallback-')
          const excluded = (form.questionGroupExclusions || []).includes(group.key)
          const incomplete = preview.incompleteQuestionGroups?.find((g) => g.key === group.key) || null
          const adapted = preview.sourceAdaptedQuestionGroups?.find((g) => g.groupKey === group.key) || null

          let actions
          if (excluded) {
            actions = (
              <div className={`${styles.groupActions} ${previewLoading ? styles.groupPendingNote : ''}`}>
                <button type="button" className={styles.btnSmall} disabled={previewLoading} onClick={() => onUndoExclusion(group.key)}>
                  Undo
                </button>
              </div>
            )
          } else if (incomplete) {
            actions = (
              <div className={`${styles.groupActions} ${previewLoading ? styles.groupPendingNote : ''}`}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={previewLoading}
                  onClick={() => onAddRelatedTopics(incomplete.missingRequiredTopicIds)}
                >
                  Add Related Topics
                </button>
                <button type="button" className={styles.btnSecondary} disabled={previewLoading} onClick={() => setConfirm({ open: true, key: group.key })}>
                  Exclude UWorld Group
                </button>
              </div>
            )
          } else {
            actions = (
              <div className={`${styles.groupActions} ${previewLoading ? styles.groupPendingNote : ''}`}>
                <button type="button" className={styles.btnSecondary} disabled={previewLoading} onClick={() => setConfirm({ open: true, key: group.key })}>
                  Exclude UWorld Group
                </button>
              </div>
            )
          }

          return (
            <UWorldGroupCard
              key={group.key}
              group={group}
              isFallback={isFallback}
              excluded={excluded}
              incomplete={incomplete}
              adapted={adapted}
              preferredQuestionsPerDay={form.preferredQuestionsPerDay}
              topicTitleById={topicTitleById}
            >
              {actions}
            </UWorldGroupCard>
          )
        })
      )}

      <p className={styles.hint}>{(form.questionGroupExclusions || []).length} group(s) excluded</p>

      <Modal
        open={confirm.open}
        onOpenChange={(v) => { if (!v) setConfirm({ open: false, key: null }) }}
        size="sm"
      >
        <Modal.Title>Exclude UWorld Group</Modal.Title>
        <Modal.Description>This group will be excluded from the plan. You can undo this at any time.</Modal.Description>
        <div className={styles.groupActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => setConfirm({ open: false, key: null })}>Cancel</button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              if (confirm.key) onExcludeGroup(confirm.key)
              setConfirm({ open: false, key: null })
            }}
          >
            Confirm Exclude
          </button>
        </div>
      </Modal>
    </div>
  )
}
