import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { TRACKING_TABS, resolveTrackingTab } from '../lib/trackingTabs'
import { BookOpen } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import { QueryErrorState, RefetchWarning } from '../components/QueryState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs/Tabs'
import DashboardView from './DashboardView'
import UWorldView from './UWorldView'
import MRCPView from './MRCPView'
import LocalBoardView from './LocalBoardView'
import Goals from './Goals'
import ResourcesModal from '../components/ResourcesModal'
import TrackingRotationSection from '../components/rotation/tracking/TrackingRotationSection'
import SessionsView from '../components/sessions/SessionsView'
import { generate } from '../services/PerformanceEngine'
import styles from './TrackingHub.module.css'

export default function TrackingHub() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [resourcesOpen, setResourcesOpen] = useState(false)

  const activeTab = resolveTrackingTab(location.pathname, searchParams)

  const handleTabChange = (nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', nextTab)
      return next
    }, { replace: true })
  }

  const { data, isLoading, isError, isRefetchError, refetch } = useQuery({
    queryKey: queryKeys.tracking.report(user?.id),
    queryFn: async () => {
      const [blocksRes, mrcpRes, boardRes, activityRes, goalsRes] = await Promise.all([
        supabase.from('uworld_blocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('mrcp_topics').select('*').eq('user_id', user.id),
        supabase.from('local_board_cases').select('*').eq('user_id', user.id),
        supabase.from('study_activity').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('goals').select('*').eq('user_id', user.id),
      ])

      for (const res of [blocksRes, mrcpRes, boardRes, activityRes, goalsRes]) {
        if (res.error) throw res.error
      }

      return generate({
        uworld: blocksRes.data || [],
        mrcp: mrcpRes.data || [],
        board: boardRes.data || [],
        activity: activityRes.data || [],
        goals: goalsRes.data || [],
      })
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const handleActivity = useMutation({
    mutationFn: async ({ module, action, entity_id, summary, metadata }) => {
      await supabase.from('study_activity').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        module,
        action,
        entity_id,
        summary,
        metadata,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.report(user?.id) })
    },
  })

  const report = data || null

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading tracking hub..." />

  if (isError && !report) {
    return (
      <div className={styles.page} data-testid="tracking-hub">
        <QueryErrorState
          message="Your tracking data couldn't load. Please try again."
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  return (
    <div className={styles.page} data-testid="tracking-hub">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className={styles.stickyBar}>
          <TabsList className={styles.hubTabList} data-testid="tracking-tablist" aria-label="Tracking sections">
            {TRACKING_TABS.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className={styles.hubTab}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className={styles.content}>
          {(isRefetchError || isError) && report && (
            <div className={styles.refetchWrap}>
              <RefetchWarning onRetry={() => refetch()} />
            </div>
          )}

          <TabsContent value="overview">
            <DashboardView report={report} onViewChange={handleTabChange} />
          </TabsContent>
          <TabsContent value="uworld">
            <UWorldView onActivity={handleActivity.mutate} />
          </TabsContent>
          <TabsContent value="mrcp">
            <MRCPView onActivity={handleActivity.mutate} />
          </TabsContent>
          <TabsContent value="board">
            <LocalBoardView onActivity={handleActivity.mutate} />
          </TabsContent>
          <TabsContent value="sessions">
            <SessionsView />
          </TabsContent>
          <TabsContent value="rotation">
            <TrackingRotationSection />
          </TabsContent>
          <TabsContent value="goals">
            <Goals />
          </TabsContent>
        </div>
      </Tabs>

      {/* Inline FAB */}
      <div className={styles.fabRow}>
        <button className={styles.fabBtn} onClick={() => setResourcesOpen(true)}>
          <BookOpen size={18} strokeWidth={1.5} />
          Study Resources
        </button>
      </div>

      {/* Resources Modal */}
      <ResourcesModal open={resourcesOpen} onClose={() => setResourcesOpen(false)} />
    </div>
  )
}
