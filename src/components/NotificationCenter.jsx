import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck, BookOpen, Users, Award, MessageCircle, Settings, Inbox, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, formatDate } from '../lib/api'
import styles from './NotificationCenter.module.css'

const CATEGORIES = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'study', label: 'Study', icon: BookOpen },
  { key: 'community', label: 'Communities', icon: Users },
  { key: 'achievement', label: 'Achievements', icon: Award },
  { key: 'social', label: 'Social', icon: MessageCircle },
  { key: 'system', label: 'System', icon: Settings },
]

const PRIORITY_COLORS = {
  critical: 'var(--red)',
  important: 'var(--amber)',
  info: 'var(--blue)',
  success: 'var(--emerald)',
}

const CATEGORY_ICONS = {
  study: '📚',
  community: '👥',
  achievement: '🎖',
  social: '💬',
  system: '⚙',
}

export default function NotificationCenter({ user }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [activeTab, setActiveTab] = useState('all')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef()
  const navigate = useNavigate()
  const totalUnread = unreadCounts.all || 0

  const loadNotifications = useCallback(async (category) => {
    if (!user) return
    setLoading(true)
    try {
      let path = '/notifications?limit=50'
      if (category && category !== 'all') path += `&category=${category}`
      const data = await apiGet(path)
      setNotifications(data?.notifications || data || [])
      if (data?.unreadCounts) setUnreadCounts(data.unreadCounts)
    } catch {}
    setLoading(false)
  }, [user])

  const loadCounts = useCallback(async () => {
    if (!user) return
    try {
      const data = await apiGet('/notifications/unread-counts')
      setUnreadCounts(data || {})
    } catch {}
  }, [user])

  useEffect(() => {
    if (user) {
      loadNotifications(activeTab)
      loadCounts()
    }
  }, [user, activeTab, loadNotifications, loadCounts])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(loadCounts, 30000)
    return () => clearInterval(interval)
  }, [user, loadCounts])

  const markAllRead = async () => {
    try {
      await apiPost('/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
      loadCounts()
    } catch {}
  }

  const markRead = async (id) => {
    try {
      await apiPost(`/notifications/${id}/read`, {})
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n))
      loadCounts()
    } catch {}
  }

  const handleAction = (notif) => {
    markRead(notif.id)
    setOpen(false)
    navigate(notif.action_url || '/dashboard')
  }

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  return (
    <div ref={ref} className={styles.wrapper}>
      <button
        onClick={() => setOpen(!open)}
        className={styles.bellBtn}
        aria-label="Notifications"
      >
        <Bell size={20} strokeWidth={1.5} />
        {totalUnread > 0 && (
          <span className={styles.badge}>{totalUnread > 99 ? '99+' : totalUnread}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {totalUnread > 0 && (
              <button onClick={markAllRead} className={styles.markAllBtn}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          <div className={styles.tabs}>
            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={13} />
                <span>{label}</span>
                {unreadCounts[key] > 0 && (
                  <span className={styles.tabBadge}>{unreadCounts[key]}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.list}>
            {loading ? (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} />
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <CheckCheck size={32} strokeWidth={1.2} />
                <p>You're all caught up!</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`${styles.item} ${n.read ? '' : styles.itemUnread}`}
                  onClick={() => handleAction(n)}
                >
                  <div className={styles.itemLeft}>
                    <div
                      className={styles.priorityBar}
                      style={{ background: PRIORITY_COLORS[n.priority] || PRIORITY_COLORS.info }}
                    />
                    <span className={styles.categoryIcon}>{CATEGORY_ICONS[n.category] || '📌'}</span>
                  </div>
                  <div className={styles.itemContent}>
                    <div className={styles.itemTitle}>{n.title}</div>
                    {n.body && <div className={styles.itemBody}>{n.body}</div>}
                    <div className={styles.itemMeta}>
                      <span className={styles.itemTime}>{formatDate(n.created_at)}</span>
                      {n.action_label && (
                        <button
                          className={styles.actionBtn}
                          onClick={(e) => { e.stopPropagation(); handleAction(n) }}
                        >
                          {n.action_label}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
