import styles from './Overlay.module.css'

export default function Overlay({ className, ...props }) {
  return <div className={`${styles.overlay} ${className || ''}`} {...props} />
}
