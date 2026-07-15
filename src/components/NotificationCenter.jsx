import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, BookOpen, Users, Award, MessageCircle, Settings, Inbox, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, formatDate } from '../lib/api'
import { useNotifications } from '../context/NotificationContext'
import { queryKeys } from '../lib/queryKeys'
import Dropdown from './ui/Dropdown/Dropdown'
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
  const { unreadCount: ctxUnread } = useNotifications()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('all')
  const navigate = useNavigate()

  const notifPath = activeTab === 'all'
    ? '/notifications?limit=50'
    : `/notifications?limit=50&category=${activeTab}`

  const { data: notifData, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list(activeTab, 50),
    queryFn: () => apiGet(notifPath),
    enabled: !!user,
    staleTime: 10_000,
  })

  const notifications = notifData?.notifications || notifData || []
  const unreadCounts = notifData?.unreadCounts || {}
  const totalUnread = ctxUnread || unreadCounts.all || 0

  const markAllMutation = useMutation({
    mutationFn: () => apiPost('/notifications/read-all', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => apiPost(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })

  const handleAction = (notif) => {
    markReadMutation.mutate(notif.id)
    navigate(notif.action_url || '/dashboard')
  }

  if (!user) return null

  return (
    <div className={styles.wrapper}>
      <Dropdown>
        <Dropdown.Trigger asChild>
          <button className={styles.bellBtn} aria-label="Notifications">
            <Bell size={20} strokeWidth={1.5} />
            {totalUnread > 0 && (
              <span className={styles.badge}>{totalUnread > 99 ? '99+' : totalUnread}</span>
            )}
          </button>
        </Dropdown.Trigger>
        <Dropdown.Content className={styles.panel} sideOffset={8}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {totalUnread > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                className={styles.markAllBtn}
                disabled={markAllMutation.isPending}
              >
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
            {isLoading ? (
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
        </Dropdown.Content>
      </Dropdown>
    </div>
  )
}
