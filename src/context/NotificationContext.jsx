import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { apiGet } from '../lib/api'

const NotificationContext = createContext(null)

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const originalTitle = useRef(document.title)

  const refreshUnread = useCallback(async () => {
    if (!user) { setUnreadCount(0); return }
    try {
      const data = await apiGet('/notifications/unread-counts')
      setUnreadCount(data?.all || 0)
    } catch {}
  }, [user])

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    refreshUnread()
    const interval = setInterval(refreshUnread, 30000)
    return () => clearInterval(interval)
  }, [user, refreshUnread])

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) MedStudy`
    } else {
      document.title = originalTitle.current
    }
    return () => { document.title = originalTitle.current }
  }, [unreadCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnread }}>
      {children}
    </NotificationContext.Provider>
  )
}
