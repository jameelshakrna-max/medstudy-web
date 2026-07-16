import { forwardRef, useCallback } from 'react'
import BaseDialog from '../BaseDialog/BaseDialog'
import styles from './Drawer.module.css'

const Drawer = forwardRef(function Drawer({
  children,
  className,
  contentClassName,
  side = 'right', // 'right' | 'left'
  width = 380,
  overlay = 'soft',
  ...props
}, ref) {
  const animation = side === 'left' ? 'slide-left' : 'slide-right'

  return (
    <BaseDialog
      ref={ref}
      animation={animation}
      layer="drawer"
      overlay={overlay}
      contentClassName={`${styles.drawer} ${side === 'left' ? styles.left : styles.right} ${contentClassName || ''}`}
      style={{ '--drawer-width': `${width}px` }}
      {...props}
    >
      {children}
    </BaseDialog>
  )
})

Drawer.Title = BaseDialog.Title
Drawer.Description = BaseDialog.Description
Drawer.Close = BaseDialog.Close
Drawer.Trigger = BaseDialog.Trigger

export default Drawer
