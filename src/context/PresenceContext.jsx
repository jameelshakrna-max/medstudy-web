import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { apiPost } from '../lib/api'
import { useAuth } from './AuthContext'

const PresenceContext = createContext(null)

export function PresenceProvider({ children }) {
  const { user } = useAuth()
  const [myStatus, setMyStatus] = useState('online')
  const presenceCache = useRef({})
  const heartbeatRef = useRef(null)

  useEffect(() => {
    if (!user?.id) return
    const beat = () => {
      apiPost('/presence/status', { status: myStatus }).catch(() => {})
    }
    beat()
    heartbeatRef.current = setInterval(beat, 30000)
    return () => clearInterval(heartbeatRef.current)
  }, [user?.id, myStatus])

  useEffect(() => {
    if (!user?.id) return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        apiPost('/presence/status', { status: 'offline' }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      apiPost('/presence/status', { status: 'offline' }).catch(() => {})
    }
  }, [user?.id])

  const updateStatus = useCallback((status, statusText = '') => {
    setMyStatus(status)
    apiPost('/presence/status', { status, status_text: statusText }).catch(() => {})
  }, [])

  const getBulkPresence = useCallback(async (userIds) => {
    if (!userIds.length) return {}
    const uncached = userIds.filter(id => !presenceCache.current[id])
    if (uncached.length) {
      try {
        const data = await apiPost('/presence/bulk', { user_ids: uncached })
        if (data?.presences) {
          Object.assign(presenceCache.current, data.presences)
        }
      } catch {}
    }
    const result = {}
    for (const id of userIds) {
      result[id] = presenceCache.current[id] || { status: 'offline' }
    }
    return result
  }, [])

  return (
    <PresenceContext.Provider value={{ myStatus, updateStatus, getBulkPresence }}>
      {children}
    </PresenceContext.Provider>
  )
}

export const usePresence = () => useContext(PresenceContext)
