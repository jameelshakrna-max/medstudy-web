import { forwardRef, useId } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import useScrollLock from '../../../hooks/useScrollLock'
import { useLayer } from '../../../context/LayerContext'
import Overlay from '../Overlay/Overlay'
import styles from './BaseDialog.module.css'

const BaseDialog = forwardRef(function BaseDialog({
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
  overlayClassName,
  layer = 'modal',
  animation = 'scale', // 'scale' | 'slide-right' | 'slide-left' | 'slide-up'
  onEscape,
  preventScroll = true,
  ...props
}, ref) {
  const id = useId()
  const { openOverlay, closeOverlay, isTopOverlay } = useLayer()
  
  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      openOverlay(id)
    } else {
      closeOverlay(id)
    }
    onOpenChange?.(nextOpen)
  }

  useScrollLock(preventScroll && open)

  const animationClass = {
    scale: styles.contentScale,
    'slide-right': styles.contentSlideRight,
    'slide-left': styles.contentSlideLeft,
    'slide-up': styles.contentSlideUp,
  }[animation] || styles.contentScale

  const layerStyle = {
    dropdown: 'var(--z-dropdown)',
    popover: 'var(--z-popover)',
    tooltip: 'var(--z-tooltip)',
    drawer: 'var(--z-drawer)',
    panel: 'var(--z-panel)',
    modal: 'var(--z-modal)',
    toast: 'var(--z-toast)',
  }[layer] || 'var(--z-modal)'

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} {...props}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <Overlay
            className={overlayClassName}
            style={{ zIndex: `calc(${layerStyle} - 1)` }}
          />
        </Dialog.Overlay>
        <Dialog.Content
          ref={ref}
          className={`${styles.content} ${animationClass} ${contentClassName || ''}`}
          style={{ zIndex: layerStyle }}
          onEscapeKeyDown={(e) => {
            if (onEscape) onEscape()
          }}
          {...props}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

// Sub-components
BaseDialog.Title = Dialog.Title
BaseDialog.Description = Dialog.Description
BaseDialog.Close = Dialog.Close
BaseDialog.Trigger = Dialog.Trigger

export default BaseDialog
