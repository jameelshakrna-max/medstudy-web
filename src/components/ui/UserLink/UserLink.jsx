import { useCallback } from 'react'
import { useProfilePanel } from '../../../context/ProfilePanelContext'
import { imageUrl } from '../../../lib/api'
import styles from './UserLink.module.css'

export default function UserLink({
  userId,
  username,
  displayName,
  avatar,
  badge,
  subtitle,
  size = 'md',
  showAvatar = true,
  showName = true,
  showHandle = false,
  children,
  className = '',
  onClick,
}) {
  const { openProfile } = useProfilePanel()

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    if (onClick) {
      onClick(e)
    } else if (userId) {
      openProfile(userId)
    }
  }, [userId, openProfile, onClick])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick(e)
    }
  }, [handleClick])

  if (!userId) {
    return (
      <span className={`${styles.plain} ${className}`}>
        {children || displayName || username || 'Unknown'}
      </span>
    )
  }

  const avatarClass = `${styles.avatar} ${styles['avatar' + size.charAt(0).toUpperCase() + size.slice(1)]}`
  const nameClass = `${styles.name} ${styles['name' + size.charAt(0).toUpperCase() + size.slice(1)]}`
  const isExternal = !!className && !className.startsWith(styles.link)

  return (
    <span
      className={`${styles.link} ${className}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {showAvatar && (
        <>
          {avatar ? (
            <img
              src={imageUrl(avatar)}
              alt=""
              className={avatarClass}
              loading="lazy"
            />
          ) : (
            <span className={avatarClass}>
              {(displayName || username || '?')[0]?.toUpperCase()}
            </span>
          )}
        </>
      )}
      {children || (
        <span className={styles.textGroup}>
          {showName && (
            <span className={styles.row}>
              <span className={nameClass}>{displayName || username}</span>
              {badge && <span className={styles.badge}>{badge}</span>}
            </span>
          )}
          {showHandle && username && displayName && (
            <span className={styles.handle}>@{username}</span>
          )}
          {subtitle && (
            <span className={styles.subtitle}>{subtitle}</span>
          )}
        </span>
      )}
    </span>
  )
}
