import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { BookOpen } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import DashboardView from './DashboardView'
import UWorldView from './UWorldView'
import MRCPView from './MRCPView'
import LocalBoardView from './LocalBoardView'
import ResourcesModal from '../components/ResourcesModal'
import { generate } from '../services/PerformanceEngine'
import styles from './TrackingHub.module.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'uworld', label: 'UWorld Tracker' },
  { id: 'mrcp', label: 'MRCP Progress' },
  { id: 'board', label: 'Local Board Tracker' },
]

export default function TrackingHub() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)

  const loadReport = useCallback(async () => {
    if (!user) return
    try {
      const [blocksRes, mrcpRes, boardRes, activityRes] = await Promise.all([
        supabase.from('uworld_blocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('mrcp_topics').select('*').eq('user_id', user.id),
        supabase.from('local_board_cases').select('*').eq('user_id', user.id),
        supabase.from('study_activity').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      ])

      const perfReport = generate({
        uworld: blocksRes.data || [],
        mrcp: mrcpRes.data || [],
        board: boardRes.data || [],
        activity: activityRes.data || [],
      })

      setReport(perfReport)
    } catch (err) {
      console.error('loadReport error:', err)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { loadReport() }, [loadReport])

  const handleActivity = useCallback(async ({ module, action, entity_id, summary, metadata }) => {
    try {
      await supabase.from('study_activity').insert({
        user_id: user.id,
        module,
        action,
        entity_id,
        summary,
        metadata,
      })
      loadReport()
    } catch (err) {
      console.error('logActivity error:', err)
    }
  }, [user, loadReport])

  if (loading) return <LoadingScreen fullPage={false} message="Loading tracking hub..." />

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
          <UWorldView onActivity={handleActivity} />
        )}
        {activeTab === 'mrcp' && (
          <MRCPView onActivity={handleActivity} />
        )}
        {activeTab === 'board' && (
          <LocalBoardView onActivity={handleActivity} />
        )}
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
