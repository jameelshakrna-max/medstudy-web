import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import styles from './PinnedResources.module.css'

const TYPE_ICONS = {
  flashcard: '📚',
  resource: '📄',
  community: '🏘️',
  competition: '🏆',
}

const TYPE_LABELS = {
  flashcard: 'Flashcard Deck',
  resource: 'Resource',
  community: 'Community',
  competition: 'Competition',
}

export default function PinnedResources({ userId, isOwnProfile }) {
  const [pins, setPins] = useState([])

  useEffect(() => {
    if (!userId) return
    apiGet(`/users/${userId}/pins`)
      .then(data => setPins(Array.isArray(data) ? data : data?.pins || []))
      .catch(() => setPins([]))
  }, [userId])

  if (!pins.length) return null

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        <span>📌</span>
        <span>Pinned</span>
        {isOwnProfile && (
          <a href="/settings" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
            Manage
          </a>
        )}
      </div>
      <div className={styles.pins}>
        {pins.map((pin) => (
          <a
            key={pin.id || pin.resource_id}
            className={styles.pin}
            href={pin.url || '#'}
          >
            <span className={styles.pinIcon}>
              {TYPE_ICONS[pin.resource_type] || '📄'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className={styles.pinName}>{pin.resource_name}</div>
              <div className={styles.pinType}>{TYPE_LABELS[pin.resource_type] || pin.resource_type}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
