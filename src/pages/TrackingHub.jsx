import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { BookOpen } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import DashboardView from './DashboardView'
import UWorldView from './UWorldView'
import MRCPView from './MRCPView'
import LocalBoardView from './LocalBoardView'
import Goals from './Goals'
import ResourcesModal from '../components/ResourcesModal'
import RotationSummary from '../components/rotation/RotationSummary'
import { generate } from '../services/PerformanceEngine'
import styles from './TrackingHub.module.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'uworld', label: 'UWorld Tracker' },
  { id: 'mrcp', label: 'MRCP Progress' },
  { id: 'board', label: 'Local Board Tracker' },
  { id: 'goals', label: 'Goals' },
  { id: 'rotation', label: 'Rotation' },
]

export default function TrackingHub() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [resourcesOpen, setResourcesOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tracking.report(user?.id),
    queryFn: async () => {
      const [blocksRes, mrcpRes, boardRes, activityRes, goalsRes] = await Promise.all([
        supabase.from('uworld_blocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('mrcp_topics').select('*').eq('user_id', user.id),
        supabase.from('local_board_cases').select('*').eq('user_id', user.id),
        supabase.from('study_activity').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('goals').select('*').eq('user_id', user.id),
      ])

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

  return (
    <div className={styles.page}>
      {/* Sticky Segmented Bar */}
      <div className={styles.stickyBar}>
        <div className={styles.segmentRow}>
          {TABS.map(tab => (
            <button key={tab.id}
              className={`${styles.segment} ${activeTab === tab.id ? styles.segmentActive : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conditional Views */}
      <div className={styles.content}>
        {activeTab === 'dashboard' && (
          <DashboardView report={report} onViewChange={setActiveTab} />
        )}
        {activeTab === 'uworld' && (
          <UWorldView onActivity={handleActivity.mutate} />
        )}
        {activeTab === 'mrcp' && (
          <MRCPView onActivity={handleActivity.mutate} />
        )}
        {activeTab === 'board' && (
          <LocalBoardView onActivity={handleActivity.mutate} />
        )}
        {activeTab === 'goals' && (
          <Goals />
        )}
        {activeTab === 'rotation' && <RotationSummary />}
      </div>

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
