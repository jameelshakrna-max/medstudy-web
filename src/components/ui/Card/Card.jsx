import { forwardRef } from 'react'
import styles from './Card.module.css'

const Card = forwardRef(function Card({
  as = 'div',
  interactive = false,
  className = '',
  children,
  ...props
}, ref) {
  const Tag = as
  const classes = [
    styles.card,
    interactive ? styles.interactive : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag ref={ref} className={classes} {...props}>
      {children}
    </Tag>
  )
})

export default Card
