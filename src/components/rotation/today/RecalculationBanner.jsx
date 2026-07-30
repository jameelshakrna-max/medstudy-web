import { Banner, BannerAction } from '../../ui/Banner/Banner'
import styles from './RecalculationBanner.module.css'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

function isStale(lastRecalculatedAt) {
  if (!lastRecalculatedAt) return true
  const diff = Date.now() - new Date(lastRecalculatedAt).getTime()
  return diff > STALE_THRESHOLD_MS
}

export default function RecalculationBanner({ lastRecalculatedAt, recalculationState, onRecalculate, onReset }) {
  if (recalculationState?.status === 'pending' || recalculationState?.status === 'in_flight') {
    return (
      <Banner variant="info" className={styles.banner}>
        Recalculating plan...
      </Banner>
    )
  }

  if (recalculationState?.status === 'failed') {
    return (
      <Banner variant="error" onDismiss={onReset} className={styles.banner}>
        Recalculation failed.{' '}
        <BannerAction onClick={onRecalculate}>
          Retry
        </BannerAction>
      </Banner>
    )
  }

  if (recalculationState?.status === 'blocked') {
    return (
      <Banner variant="warning" onDismiss={onReset} className={styles.banner}>
        Recalculation blocked by an in-progress task. Complete or skip it first.
      </Banner>
    )
  }

  if (isStale(lastRecalculatedAt)) {
    return (
      <Banner variant="warning" className={styles.banner}>
        Plan may be out of date.{' '}
        <BannerAction onClick={onRecalculate}>
          Recalculate
        </BannerAction>
      </Banner>
    )
  }

  return null
}
