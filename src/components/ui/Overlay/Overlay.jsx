import { forwardRef } from 'react'
import styles from './Overlay.module.css'

const Overlay = forwardRef(function Overlay({ className, ...props }, ref) {
  return <div ref={ref} className={`${styles.overlay} ${className || ''}`} {...props} />
})

Overlay.displayName = 'Overlay'

export default Overlay
