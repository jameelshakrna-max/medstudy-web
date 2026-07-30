import Modal from '../../../ui/Modal/Modal'
import styles from './ActionDialog.module.css'

export default function ActionDialog({ open, onClose, title, description, children, actions }) {
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) onClose() }} size="sm">
      <div className={styles.header}>
        <Modal.Title className={styles.title}>{title}</Modal.Title>
        <Modal.Close asChild>
          <button className={styles.closeBtn} aria-label="Close">&times;</button>
        </Modal.Close>
      </div>
      {description && <Modal.Description className={styles.description}>{description}</Modal.Description>}
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </Modal>
  )
}
