import { Link } from 'react-router-dom'
import styles from './ContextualShortcuts.module.css'

/**
 * Mobile-only contextual quick-action row rendered inside page content
 * (outside the persistent BottomNav). Renders each item as a router Link
 * (when `to` is provided) or a button (when `onClick` is provided).
 *
 * Items: { key, icon, label, to?, onClick?, disabled? }
 */
export default function ContextualShortcuts({ items = [] }) {
  return (
    <div className={styles.shortcuts} aria-label="Quick actions">
      {items.map((item) => {
        const content = (
          <>
            {item.icon && <span className={styles.shortcutIcon}>{item.icon}</span>}
            {item.label}
          </>
        )
        if (item.to) {
          return (
            <Link key={item.key} to={item.to} className={styles.shortcut}>
              {content}
            </Link>
          )
        }
        return (
          <button
            key={item.key}
            type="button"
            className={styles.shortcut}
            onClick={item.onClick}
            disabled={item.disabled}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
