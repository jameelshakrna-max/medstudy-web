import { forwardRef, useId, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import useScrollLock from '../../../hooks/useScrollLock'
import { useLayer } from '../../../context/LayerContext'
import { X } from 'lucide-react'
import Overlay from '../Overlay/Overlay'
import overlayStyles from '../Overlay/Overlay.module.css'
import styles from './MobileSheet.module.css'

const MobileSheet = forwardRef(function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel = 'Close',
  className = '',
  contentClassName = '',
  ...props
}, ref) {
  const id = useId()
  const { openOverlay, closeOverlay } = useLayer()
  const previouslyFocusedRef = useRef(null)

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement
    }
  }, [open])

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      openOverlay(id)
    } else {
      closeOverlay(id)
    }
    onOpenChange?.(nextOpen)
  }

  useScrollLock(open)

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} {...props}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <Overlay
            className={overlayStyles.soft}
            style={{ zIndex: 'var(--z-drawer)' }}
          />
        </Dialog.Overlay>
        <Dialog.Content
          ref={ref}
          aria-modal="true"
          className={`${styles.sheet} ${className} ${contentClassName}`}
          style={{ zIndex: 'calc(var(--z-drawer) + 1)' }}
          onCloseAutoFocus={(e) => {
            const previous = previouslyFocusedRef.current
            if (previous && previous.isConnected && typeof previous.focus === 'function') {
              e.preventDefault()
              previous.focus()
            }
          }}
        >
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {description && (
                <Dialog.Description asChild>
                  <VisuallyHidden>{description}</VisuallyHidden>
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label={closeLabel}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

export default MobileSheet
