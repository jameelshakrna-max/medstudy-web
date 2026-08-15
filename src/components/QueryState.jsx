import { AlertCircle } from 'lucide-react'
import Button from './ui/Button/Button'
import { Banner, BannerAction } from './ui/Banner/Banner'
import styles from './QueryState.module.css'

export function QueryErrorState({
  message = 'Something went wrong while loading this data.',
  onRetry,
  compact = false,
}) {
  return (
    <div
      role="alert"
      data-testid="query-error-state"
      className={`${styles.errorState} ${compact ? styles.compact : styles.centered}`}
    >
      <AlertCircle className={styles.errorIcon} size={20} aria-hidden="true" />
      <p className={styles.errorMessage}>{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          onClick={onRetry}
          data-testid="query-error-retry"
        >
          Retry
        </Button>
      )}
    </div>
  )
}

export function RefetchWarning({
  message = 'Could not refresh this data. Showing your last loaded results.',
  onRetry,
}) {
  return (
    <div data-testid="refetch-warning">
      <Banner variant="warning">
        {message}
        {onRetry && (
          <BannerAction onClick={onRetry}>
            Retry
          </BannerAction>
        )}
      </Banner>
    </div>
  )
}
