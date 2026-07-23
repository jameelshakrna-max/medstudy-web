import { Banner, BannerAction } from '../../ui/Banner/Banner'
import usePlannerTaskMutations from './usePlannerTaskMutations'
import styles from './RecalculationBanner.module.css'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

function isStale(lastRecalculatedAt) {
  if (!lastRecalculatedAt) return true
  const diff = Date.now() - new Date(lastRecalculatedAt).getTime()
  return diff > STALE_THRESHOLD_MS
}

export default function RecalculationBanner({ planId, lastRecalculatedAt, revision }) {
  const mutations = usePlannerTaskMutations({
    planId,
    initialRevision: revision,
    getRecalculationDate: () => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    },
  })

  if (mutations.recalculationState?.status === 'pending' || mutations.recalculationState?.status === 'in_flight') {
    return (
      <Banner variant="info" className={styles.banner}>
        Recalculating plan...
      </Banner>
    )
  }

  if (mutations.recalculationState?.status === 'failed') {
    return (
      <Banner variant="error" onDismiss={() => mutations.reset()} className={styles.banner}>
        Recalculation failed.{' '}
        <BannerAction onClick={() => mutations.retryRecalculation()}>
          Retry
        </BannerAction>
      </Banner>
    )
  }

  if (mutations.recalculationState?.status === 'blocked') {
    return (
      <Banner variant="warning" onDismiss={() => mutations.reset()} className={styles.banner}>
        Recalculation blocked by an in-progress task. Complete or skip it first.
      </Banner>
    )
  }

  if (isStale(lastRecalculatedAt)) {
    return (
      <Banner variant="warning" className={styles.banner}>
        Plan may be out of date.{' '}
        <BannerAction onClick={() => mutations.retryRecalculation()}>
          Recalculate
        </BannerAction>
      </Banner>
    )
  }

  return null
}
