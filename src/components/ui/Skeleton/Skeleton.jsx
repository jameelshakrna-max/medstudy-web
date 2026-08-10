import styles from './Skeleton.module.css'

export default function Skeleton({
  width,
  height,
  variant = 'text',
  className = '',
  ...props
}) {
  const style = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height

  return (
    <span
      className={`${styles.skeleton} ${styles[variant] || styles.text} ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  )
}
