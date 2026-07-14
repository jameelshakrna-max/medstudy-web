import { createContext, useContext, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

const NotificationContext = createContext(null)

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const originalTitle = useRef(document.title)

  const { data: unreadCounts, refetch: refreshUnread } = useQuery({
    queryKey: queryKeys.notifications.unreadByCategory(),
    queryFn: () => apiGet('/notifications/unread-counts'),
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const unreadCount = unreadCounts?.all || 0

  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) MedStudy`
    } else {
      document.title = originalTitle.current
    }
    return () => { document.title = originalTitle.current }
  }, [unreadCount])

  const value = useMemo(() => ({
    unreadCount,
    refreshUnread: () => {
      refreshUnread()
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  }), [unreadCount, refreshUnread, queryClient])

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
