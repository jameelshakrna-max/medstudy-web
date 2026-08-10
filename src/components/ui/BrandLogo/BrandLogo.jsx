import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './BrandLogo.module.css'

const RATIOS = { horizontal: 310 / 72, symbol: 1 }
const ASSETS = {
  horizontal: {
    light: '/brand/medstudy-logo-horizontal.svg',
    dark: '/brand/medstudy-logo-horizontal-dark.svg',
  },
  symbol: {
    light: '/brand/medstudy-symbol.svg',
    dark: '/brand/medstudy-symbol-dark.svg',
  },
}
const DEFAULT_ALT = { horizontal: 'MedStudy OS', symbol: 'MedStudy OS logo' }

function getInitialTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark'
}

export default function BrandLogo({
  variant = 'horizontal',
  size,
  className,
  linkToHome,
  alt,
  ariaLabel,
  style,
}) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          setTheme(root.getAttribute('data-theme') || 'dark')
        }
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    const handleStorage = (e) => {
      if (e.key === 'medstudy-theme') {
        setTheme(e.newValue === 'light' ? 'light' : 'dark')
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      observer.disconnect()
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const ratio = RATIOS[variant]
  const src = ASSETS[variant][theme === 'light' ? 'light' : 'dark']

  const imgStyle = {}
  if (typeof size === 'number') {
    imgStyle.width = `${size}px`
    imgStyle.height = `${Math.round(size / ratio)}px`
  }
  imgStyle.aspectRatio = String(ratio)

  const resolvedAlt = alt ?? DEFAULT_ALT[variant]
  const img = (
    <img
      src={src}
      alt={resolvedAlt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? Math.round(size / ratio) : undefined}
      className={`${styles.img} ${className || ''}`.trim()}
      style={style ? { ...imgStyle, ...style } : imgStyle}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    />
  )

  if (linkToHome) {
    return (
      <Link
        to="/"
        className={styles.link}
        aria-label={ariaLabel ?? 'MedStudy OS home'}
        title="MedStudy OS"
      >
        {img}
      </Link>
    )
  }

  return img
}
