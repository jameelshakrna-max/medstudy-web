import { forwardRef } from 'react'
import BaseDialog from '../BaseDialog/BaseDialog'
import styles from './Modal.module.css'

const Modal = forwardRef(function Modal({
  children,
  className,
  contentClassName,
  size = 'md',
  ...props
}, ref) {
  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
    xl: styles.sizeXl,
    full: styles.sizeFull,
  }[size] || styles.sizeMd

  return (
    <BaseDialog
      ref={ref}
      animation="scale"
      layer="modal"
      contentClassName={`${styles.modal} ${sizeClass} ${contentClassName || ''}`}
      {...props}
    >
      {children}
    </BaseDialog>
  )
})

Modal.Title = BaseDialog.Title
Modal.Description = BaseDialog.Description
Modal.Close = BaseDialog.Close
Modal.Trigger = BaseDialog.Trigger

export default Modal
