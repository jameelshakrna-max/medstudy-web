import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { Banner, BannerAction } from '../../ui/Banner/Banner'
import styles from './PlannerStaleBanner.module.css'

export default function PlannerStaleBanner({ planId, staleAt, lastRecalculatedAt, revision, getRecalculationDate, visible }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const isStale = visible !== undefined
    ? visible
    : staleAt && (!lastRecalculatedAt || new Date(staleAt) > new Date(lastRecalculatedAt))

  const handleRecalculate = useCallback(async () => {
    if (status === 'calculating') return
    setStatus('calculating')
    setError(null)

    try {
      const recalculationDate = getRecalculationDate ? getRecalculationDate() : new Date().toISOString().slice(0, 10)
      const clientRequestId = crypto.randomUUID()
      await apiPost(`/rotation-planner/plans/${planId}/recalculate`, {
        expectedRevision: revision,
        recalculationDate,
        clientRequestId,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.rotations.plan(planId) })
      setStatus('idle')
    } catch (err) {
      setError(err?.message || 'Recalculation failed')
      setStatus('idle')
    }
  }, [planId, revision, getRecalculationDate, queryClient, status])

  if (status === 'calculating') {
    return (
      <Banner variant="info" className={styles.banner}>
        Recalculating plan...
      </Banner>
    )
  }

  if (!isStale) return null

  return (
    <Banner variant="warning" className={styles.banner} onDismiss={() => setStatus('idle')}>
      Plan data may be out of date.
      {error && <span className={styles.errorDetail}> {error}</span>}
      <BannerAction onClick={handleRecalculate}>
        {status === 'calculating' ? 'Recalculating...' : 'Recalculate Plan'}
      </BannerAction>
    </Banner>
  )
}
