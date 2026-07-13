import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, User } from 'lucide-react'
import NotificationCenter from './NotificationCenter'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'Student'

  return (
    <div className={styles.topBar}>
      <div className={styles.spacer} />
      <div className={styles.right}>
        <NotificationCenter user={user} />
        <div className={styles.userMenu} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setMenuOpen(!menuOpen)}>
            <div className={styles.userDot} />
            <span className={styles.userName}>{displayName}</span>
            <ChevronDown size={14} className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`} />
          </button>
          {menuOpen && (
            <div className={styles.dropdown}>
              <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); navigate('/settings') }}>
                <Settings size={15} /> Settings
              </button>
              <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); navigate('/profile/' + user?.id) }}>
                <User size={15} /> Profile
              </button>
              <div className={styles.dropdownDivider} />
              <button className={`${styles.dropdownItem} ${styles.dropdownDanger}`} onClick={async () => { await signOut(); navigate('/') }}>
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
