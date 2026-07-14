import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'

const ProfilePanelContext = createContext(null)

export function ProfilePanelProvider({ children }) {
  const [panelState, setPanelState] = useState({ open: false, userId: null })
  const preloadTimerRef = useRef(null)
  const queryClient = useQueryClient()

  const openProfile = useCallback((userId) => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    setPanelState({ open: true, userId })
  }, [])

  const preloadProfile = useCallback((userId) => {
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current)
    preloadTimerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.profile.detail(userId),
        staleTime: 5 * 60_000,
      })
      queryClient.prefetchQuery({
        queryKey: queryKeys.profile.activity(userId, 10),
        staleTime: 5 * 60_000,
      })
      queryClient.prefetchQuery({
        queryKey: queryKeys.profile.achievements(userId),
        staleTime: 5 * 60_000,
      })
      preloadTimerRef.current = null
    }, 400)
  }, [queryClient])

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
    setPanelState({ open: false, userId: null })
  }, [])

  const value = useMemo(() => ({ panelState, openProfile, closeProfile, preloadProfile, cancelPreload }), [panelState, openProfile, closeProfile, preloadProfile, cancelPreload])

  return (
    <ProfilePanelContext.Provider value={value}>
      {children}
    </ProfilePanelContext.Provider>
  )
}

export function useProfilePanel() {
  const ctx = useContext(ProfilePanelContext)
  if (!ctx) throw new Error('useProfilePanel must be used within ProfilePanelProvider')
  return ctx
}
