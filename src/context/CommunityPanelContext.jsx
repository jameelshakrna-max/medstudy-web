import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'

const CommunityPanelContext = createContext(null)

export function CommunityPanelProvider({ children }) {
  const [panelState, setPanelState] = useState({ open: false, communityId: null })
  const preloadTimerRef = useRef(null)
  const queryClient = useQueryClient()

  const openCommunity = useCallback((communityId) => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    setPanelState({ open: true, communityId })
  }, [])

  const preloadCommunity = useCallback((communityId) => {
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current)
    preloadTimerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.communityPanel.full(communityId),
        staleTime: 5 * 60_000,
      })
      queryClient.prefetchQuery({
        queryKey: queryKeys.communityPanel.heatmap(communityId, new Date().getFullYear()),
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

  const closeCommunity = useCallback(() => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    setPanelState({ open: false, communityId: null })
  }, [])

  const value = useMemo(() => ({ panelState, openCommunity, closeCommunity, preloadCommunity, cancelPreload }), [panelState, openCommunity, closeCommunity, preloadCommunity, cancelPreload])

  return (
    <CommunityPanelContext.Provider value={value}>
      {children}
    </CommunityPanelContext.Provider>
  )
}

export function useCommunityPanel() {
  const ctx = useContext(CommunityPanelContext)
  if (!ctx) throw new Error('useCommunityPanel must be used within CommunityPanelProvider')
  return ctx
}
