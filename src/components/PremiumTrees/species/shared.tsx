import type { CSSProperties, ReactNode } from 'react'
import styles from '../PremiumTree.module.css'

export function layerStyle(grow: number, origin = '50% 100%'): CSSProperties {
  return {
    '--grow': grow,
    '--origin': origin,
  } as CSSProperties
}

export function drawStyle(draw: number): CSSProperties {
  return { '--draw': draw } as CSSProperties
}

export function Ground({ grow, children }: { grow: number; children: ReactNode }) {
  return (
    <g className={styles.ground} style={layerStyle(grow, '50% 50%')}>
      {children}
    </g>
  )
}

export function GrowLayer({
  grow,
  origin,
  className = '',
  children,
}: {
  grow: number
  origin?: string
  className?: string
  children: ReactNode
}) {
  return (
    <g
      className={`${styles.growLayer} ${className}`.trim()}
      style={layerStyle(grow, origin)}
    >
      {children}
    </g>
  )
}

export function DetailLayer({
  grow,
  className = '',
  children,
}: {
  grow: number
  className?: string
  children: ReactNode
}) {
  return (
    <g
      className={`${styles.detailLayer} ${className}`.trim()}
      style={layerStyle(grow)}
    >
      {children}
    </g>
  )
}

export function DrawGroup({
  draw,
  className = '',
  children,
}: {
  draw: number
  className?: string
  children: ReactNode
}) {
  return (
    <g
      className={`${styles.drawGroup} ${className}`.trim()}
      style={drawStyle(draw)}
    >
      {children}
    </g>
  )
}

export function TrunkGrow({
  grow,
  className = '',
  children,
}: {
  grow: number
  className?: string
  children: ReactNode
}) {
  return (
    <g
      className={`${styles.trunkGrow} ${className}`.trim()}
      style={layerStyle(grow)}
    >
      {children}
    </g>
  )
}

export function WindGroup({
  active,
  speed = 'medium',
  reverse = false,
  className = '',
  children,
}: {
  active: boolean
  speed?: 'slow' | 'medium' | 'fast'
  reverse?: boolean
  className?: string
  children: ReactNode
}) {
  const speedClass =
    speed === 'slow'
      ? styles.windSlow
      : speed === 'fast'
        ? styles.windFast
        : styles.windMedium

  return (
    <g
      className={`${speedClass} ${active ? styles.windOn : ''} ${
        reverse ? styles.windReverse : ''
      } ${className}`.trim()}
    >
      {children}
    </g>
  )
}
