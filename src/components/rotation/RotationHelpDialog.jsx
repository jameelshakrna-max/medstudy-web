import { useEffect, useRef } from 'react'
import Modal from '../ui/Modal/Modal'
import styles from './RotationHelpDialog.module.css'

const SECTIONS = [
  {
    title: 'Learning',
    body: "Every topic starts as a Learning task. Completing a topic's learning unlocks its UWorld questions.",
  },
  {
    title: 'UWorld',
    body: 'UWorld questions for a topic stay locked until you complete its learning first. Work the questions in UWorld, then record your progress in MedStudy so your plan stays up to date.',
  },
  {
    title: 'Partial progress',
    body: 'If you finish only part of a UWorld question set, record the number you completed. The remaining questions are rescheduled after your plan recalculates.',
  },
  {
    title: 'Anki',
    body: 'Your Anki reviews come from the decks mapped to your rotation topics. The Anki Status section shows how many flashcards are due today.',
  },
  {
    title: 'Recalculation',
    body: 'When the plan cannot distribute its remaining work on its own, it shows a banner asking you to recalculate. Recalculation redistributes your completed or changed work across the remaining schedule.',
  },
]

export default function RotationHelpDialog({ open, onClose }) {
  const returnFocusRef = useRef(null)

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement
    } else if (returnFocusRef.current) {
      returnFocusRef.current.focus?.()
      returnFocusRef.current = null
    }
  }, [open])

  return (
    <Modal open={open} onOpenChange={(next) => { if (!next) onClose() }} size="sm">
      <div className={styles.header}>
        <Modal.Title className={styles.title}>How your rotation plan works</Modal.Title>
        <Modal.Close asChild>
          <button type="button" className={styles.closeBtn} aria-label="Close">&times;</button>
        </Modal.Close>
      </div>
      <div className={styles.sections}>
        {SECTIONS.map(section => (
          <section key={section.title} className={styles.section}>
            <h4 className={styles.sectionTitle}>{section.title}</h4>
            <p className={styles.sectionBody}>{section.body}</p>
          </section>
        ))}
      </div>
    </Modal>
  )
}
