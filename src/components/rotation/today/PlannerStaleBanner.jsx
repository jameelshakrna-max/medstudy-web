import { Banner, BannerAction } from '../../ui/Banner/Banner'
import styles from './PlannerStaleBanner.module.css'

export default function PlannerStaleBanner({ staleAt, lastRecalculatedAt, visible, isRecalculating, onRecalculate }) {
  const isStale = visible !== undefined
    ? visible
    : staleAt && (!lastRecalculatedAt || new Date(staleAt) > new Date(lastRecalculatedAt))

  if (isRecalculating) {
    return (
      <Banner variant="info" className={styles.banner}>
        Recalculating plan...
      </Banner>
    )
  }

  if (!isStale) return null

  return (
    <Banner variant="warning" className={styles.banner}>
      Plan data may be out of date.{' '}
      <BannerAction onClick={onRecalculate}>
        Recalculate Plan
      </BannerAction>
    </Banner>
  )
}
