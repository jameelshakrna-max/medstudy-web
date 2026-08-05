import { Banner, BannerAction } from '../../ui/Banner/Banner'
import styles from './RecalculationBanner.module.css'

export default function RecalculationBanner({ staleAt, lastRecalculatedAt, visible, recalculationState, onRecalculate, onReset }) {
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

  const isStale = visible !== undefined
    ? visible
    : staleAt && (!lastRecalculatedAt || new Date(staleAt) > new Date(lastRecalculatedAt))

  if (isStale) {
    return (
      <Banner variant="warning" className={styles.banner}>
        Your completed or changed work needs to be redistributed across the remaining schedule.{' '}
        <BannerAction onClick={onRecalculate}>
          Recalculate Plan
        </BannerAction>
      </Banner>
    )
  }

  return null
}
