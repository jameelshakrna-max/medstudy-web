import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { fetchProfile } from '../lib/profileCache'

const ProfilePanelContext = createContext(null)

export function ProfilePanelProvider({ children }) {
  const [panelState, setPanelState] = useState({ open: false, userId: null, data: null, loading: false })
  const preloadTimerRef = useRef(null)
  const currentUserIdRef = useRef(null)

  const openProfile = useCallback(async (userId) => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    currentUserIdRef.current = userId
    setPanelState({ open: true, userId, data: null, loading: true })
    try {
      const data = await fetchProfile(userId)
      if (currentUserIdRef.current === userId) {
        setPanelState({ open: true, userId, data, loading: false })
      }
    } catch (err) {
      console.error('Profile panel fetch failed:', err)
      if (currentUserIdRef.current === userId) {
        setPanelState({ open: true, userId, data: null, loading: false })
      }
    }
  }, [])

  const preloadProfile = useCallback((userId) => {
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current)
    preloadTimerRef.current = setTimeout(() => {
      fetchProfile(userId).catch(() => {})
      preloadTimerRef.current = null
    }, 400)
  }, [])

  const cancelPreload = useCallback(() => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [])

  const closeProfile = useCallback(() => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    currentUserIdRef.current = null
    setPanelState({ open: false, userId: null, data: null, loading: false })
  }, [])

  return (
    <ProfilePanelContext.Provider value={{ panelState, openProfile, closeProfile, preloadProfile, cancelPreload }}>
      {children}
    </ProfilePanelContext.Provider>
  )
}

export function useProfilePanel() {
  const ctx = useContext(ProfilePanelContext)
  if (!ctx) throw new Error('useProfilePanel must be used within ProfilePanelProvider')
  return ctx
}
