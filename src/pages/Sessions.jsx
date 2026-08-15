import SessionsView from '../components/sessions/SessionsView'
import styles from './Page.module.css'

export default function Sessions() {
  return (
    <div className={styles.page}>
      <SessionsView />
    </div>
  )
}
